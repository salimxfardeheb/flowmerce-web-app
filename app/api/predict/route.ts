// app/api/predict/route.ts
//
// Endpoint public appelé par les vendeurs avec leur clé API.
// Flux : Validation clé → Application politique → Appel FastAPI → Log → Réponse
//
// Usage vendeur :
//   POST /api/predict
//   Header: x-api-key: flw_xxxxxxxx
//   Body:   { ...ReturnRequest }

import { NextRequest, NextResponse }    from "next/server";
import { Prisma }                        from "@prisma/client";
import { prisma }                        from "@/lib/prisma";
import { validateApiKey }                from "@/lib/api-key-auth";
import { findOrCreateFraudRecord, computeFraudScore } from "@/lib/fraud-score";
import { callMLPredict }                 from "@/lib/services/ml";
import { checkReturnPolicy }             from "@/lib/services/return-policy";

// ─────────────────────────────────────────────────────────────
// Types (miroir du schéma Pydantic FastAPI)
// ─────────────────────────────────────────────────────────────
interface ReturnRequest {
  Customer_Gender:        string;
  Customer_Age:           number;
  Customer_Wilaya:        string;
  Customer_Past_Returns:  number;
  Shop_Name:              string;
  Product_Category:       string;
  Product_Price_DA:       number;
  Order_Quantity:         number;
  Total_Amount_DA:        number;
  Payment_Method:         string;
  Shipping_Method:        string;
  Shipping_Cost_DA:       number;
  Return_Reason:          string;
  Days_to_Return:         number;
  Shop_Return_Window_Days: number;
  Within_Return_Policy:   0 | 1;
  Fraud_Score:            number;
  Customer_Satisfaction:  number;
  Is_Suspicious:          0 | 1;
}

// ─────────────────────────────────────────────────────────────
// Validation des champs requis
// ─────────────────────────────────────────────────────────────
const REQUIRED_FIELDS: (keyof ReturnRequest)[] = [
  "Customer_Gender", "Customer_Age", "Customer_Wilaya", "Customer_Past_Returns",
  "Shop_Name", "Product_Category", "Product_Price_DA", "Order_Quantity",
  "Total_Amount_DA", "Payment_Method", "Shipping_Method", "Shipping_Cost_DA",
  "Return_Reason", "Days_to_Return", "Customer_Satisfaction", "Is_Suspicious",
];

function validateInput(body: Partial<ReturnRequest>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === "")
      return `Champ manquant ou invalide : ${field}`;
  }
  if (body.Customer_Satisfaction! < 1 || body.Customer_Satisfaction! > 5)
    return "Customer_Satisfaction doit être entre 1 et 5";
  if (body.Is_Suspicious !== 0 && body.Is_Suspicious !== 1) return "Is_Suspicious doit être 0 ou 1";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Return_Reason → ClaimType
// ─────────────────────────────────────────────────────────────
function mapReasonToType(reason: string): 'EXCHANGE' | 'REFUND' | 'REPAIR' {
  const r = reason.toLowerCase()
  if (r.includes('defect') || r.includes('broken') || r.includes('repair') || r.includes('panne')) return 'REPAIR'
  if (r.includes('exchange') || r.includes('wrong') || r.includes('size') || r.includes('taille')) return 'EXCHANGE'
  return 'REFUND'
}

// ─────────────────────────────────────────────────────────────
// Enrichissement de l'input ML avec la politique vendeur
// ─────────────────────────────────────────────────────────────
function enrichWithVendorPolicy(
  input: Partial<ReturnRequest>,
  policy: { maxClaimDays: number; fraudScoreThreshold?: number | null } | null,
): { enriched: ReturnRequest; warnings: string[] } {
  const enriched  = { ...input } as ReturnRequest;
  const warnings: string[] = [];

  if (!policy) return { enriched, warnings };

  enriched.Shop_Return_Window_Days = policy.maxClaimDays;
  enriched.Within_Return_Policy    = enriched.Days_to_Return <= policy.maxClaimDays ? 1 : 0;

  const threshold = policy.fraudScoreThreshold ?? 70;
  if (enriched.Fraud_Score >= threshold) {
    enriched.Is_Suspicious = 1;
    warnings.push(`Fraud_Score (${enriched.Fraud_Score}) dépasse le seuil vendeur (${threshold}) — marqué comme suspect`);
  }

  return { enriched, warnings };
}

// ─────────────────────────────────────────────────────────────
// POST /api/predict
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth
  const rawKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;

  const auth = await validateApiKey(rawKey);
  if (!auth.ok) return auth.response;
  const { keyRecord } = auth;

  // 2. Parse + validate
  let rawBody: Partial<ReturnRequest>;
  try { rawBody = await req.json(); }
  catch { return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 }); }

  const validationError = validateInput(rawBody);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });

  // 3. Politique bloquante (délai + type accepté)
  const policy      = keyRecord.vendor.returnPolicy;
  const policyCheck = checkReturnPolicy(policy, {
    daysToReturn: rawBody.Days_to_Return!,
    claimType:    mapReasonToType(rawBody.Return_Reason!),
  });

  if (!policyCheck.ok) {
    return NextResponse.json(
      { refused: true, reason: policyCheck.code, message: policyCheck.message },
      { status: 200 },
    );
  }

  // 4. Fraud score cross-boutique
  const rawBodyAny = rawBody as Record<string, unknown>;
  const { record: fraudRecord } = await findOrCreateFraudRecord(
    rawBodyAny.customer_email as string | undefined,
    rawBodyAny.customer_phone as string | undefined,
  );
  rawBody.Fraud_Score = computeFraudScore(fraudRecord);

  // 5. Enrichir l'input ML avec la politique vendeur
  const { enriched: mlInput, warnings: policyWarnings } = enrichWithVendorPolicy(rawBody, policy);

  // Supprimer Refund_Amount_DA du payload ML (retiré côté ML)
  delete (mlInput as unknown as Record<string, unknown>).Refund_Amount_DA;

  // 6. Appel ML
  const mlResult = await callMLPredict(mlInput);

  if (!mlResult.ok) {
    if (mlResult.timedOut) {
      return NextResponse.json(
        { error: "Le serveur ML n'a pas répondu dans les délais (10 s)", mlServerDown: true },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "Le serveur de prédiction est inaccessible.", mlServerDown: true, detail: mlResult.error },
      { status: 503 },
    );
  }

  // 7. Log + mise à jour lastUsedAt
  await Promise.all([
    prisma.predictionLog.create({
      data: { vendorId: keyRecord.vendorId, input: mlInput as unknown as Prisma.InputJsonValue, output: mlResult.prediction as unknown as Prisma.InputJsonValue },
    }).catch((e) => console.error("[predict] Log error:", e)),

    prisma.apiKey.update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => console.error("[predict] lastUsedAt update error:", e)),
  ]);

  return NextResponse.json(
    {
      ...mlResult.prediction,
      vendor_policy_applied: {
        return_window_days: policy?.maxClaimDays ?? 14,
        within_policy:      mlInput.Within_Return_Policy === 1,
        warnings:           policyWarnings,
      },
    },
    { status: 200 },
  );
}

// ─────────────────────────────────────────────────────────────
// GET /api/predict → documentation inline
// ─────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    endpoint:        "POST /api/predict",
    description:     "Prédiction de résolution et du payeur des frais de retour",
    authentication:  "Header requis : x-api-key ou Authorization: Bearer <key>",
    required_fields: REQUIRED_FIELDS,
    example_request: {
      Customer_Gender: "Female", Customer_Age: 30, Customer_Wilaya: "Alger",
      Customer_Past_Returns: 3, Shop_Name: "MonShop", Product_Category: "Electronics",
      Product_Price_DA: 15000, Order_Quantity: 1, Total_Amount_DA: 15500,
      Payment_Method: "CCP", Shipping_Method: "Standard", Shipping_Cost_DA: 500,
      Return_Reason: "Defective", Days_to_Return: 5, Fraud_Score: 12,
      Customer_Satisfaction: 4, Is_Suspicious: 0,
    },
    example_response: {
      resolution:           { prediction: "Refund", probabilities: { Exchange: 0.12, Refund: 0.71, Reject: 0.09, Repair: 0.08 } },
      vendor_policy_applied: { return_window_days: 14, within_policy: true, warnings: [] },
    },
  });
}
