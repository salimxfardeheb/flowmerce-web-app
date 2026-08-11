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
import { findFraudRecord, computeFraudScore } from "@/lib/fraud-score";
import { callMLPredict }                 from "@/lib/services/ml";
import { checkReturnPolicy }             from "@/lib/services/return-policy";
import {
  normalizeCustomerGender,
  normalizeCustomerWilaya,
  normalizePaymentMethod,
  normalizeProductCategory,
  normalizeReturnReason,
  normalizeShippingMethod,
}                                        from "@/lib/ml-contract";
import { log }                           from "@/lib/logger";

// ─────────────────────────────────────────────────────────────
// Types (miroir du schéma Pydantic FastAPI `ReturnRequest`)
//
// `Customer_Satisfaction` a disparu du contrat : Flowmerce ne mesure aucune
// satisfaction, et l'API ML refuse désormais tout champ hors contrat
// (`extra="forbid"`). Il était exigé ici alors qu'il n'était jamais utilisé.
// ─────────────────────────────────────────────────────────────
interface ReturnRequest {
  Customer_ID?:           string;
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
  Is_Suspicious:          0 | 1;
}

/**
 * Champs d'identification du client — hors contrat ML, propres à Flowmerce.
 * Ils servent uniquement à retrouver l'historique anti-fraude cross-boutique.
 *
 * Ils étaient lus (`rawBody.customer_email`) sans avoir jamais été déclarés ni
 * documentés : ils valaient donc toujours `undefined`, ce qui faisait créer un
 * `CustomerFraudRecord` vide à chaque appel (C-06). Ils sont désormais partie
 * intégrante du contrat documenté, et facultatifs.
 */
interface CustomerIdentity {
  customer_email?: string;
  customer_phone?: string;
}

type PredictBody = Partial<ReturnRequest> & CustomerIdentity;

// ─────────────────────────────────────────────────────────────
// Validation des champs requis
// ─────────────────────────────────────────────────────────────
const REQUIRED_FIELDS: (keyof ReturnRequest)[] = [
  "Customer_Gender", "Customer_Age", "Customer_Wilaya", "Customer_Past_Returns",
  "Shop_Name", "Product_Category", "Product_Price_DA", "Order_Quantity",
  "Total_Amount_DA", "Payment_Method", "Shipping_Method", "Shipping_Cost_DA",
  "Return_Reason", "Days_to_Return", "Is_Suspicious",
];

const OPTIONAL_FIELDS = [
  "Customer_ID", "Shop_Return_Window_Days", "Within_Return_Policy",
  "Fraud_Score", "customer_email", "customer_phone",
] as const;

function validateInput(body: PredictBody): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === "")
      return `Champ manquant ou invalide : ${field}`;
  }
  if (body.Is_Suspicious !== 0 && body.Is_Suspicious !== 1) return "Is_Suspicious doit être 0 ou 1";
  return null;
}

/**
 * Ne laisse partir vers l'API ML que les champs du contrat.
 *
 * Nécessaire depuis que `ReturnRequest` (Pydantic) est en `extra="forbid"` :
 * un champ hors contrat provoquerait un 422. Le filtrage est fait à partir de
 * la liste des champs, pas par suppression au cas par cas — un futur champ
 * propriétaire ne fuitera pas par oubli.
 */
const CONTRACT_FIELDS = new Set<string>([
  ...REQUIRED_FIELDS,
  "Customer_ID", "Shop_Return_Window_Days", "Within_Return_Policy", "Fraud_Score",
]);

function toMLPayload(input: ReturnRequest): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (CONTRACT_FIELDS.has(key)) payload[key] = value;
  }
  return payload;
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
  let rawBody: PredictBody;
  try { rawBody = await req.json(); }
  catch { return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 }); }

  const validationError = validateInput(rawBody);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 422 });

  // 3. Politique bloquante (délai + type accepté)
  const policy      = keyRecord.vendor.returnPolicy;
  const policyCheck = checkReturnPolicy(policy, {
    daysToReturn:    rawBody.Days_to_Return!,
    productCategory: rawBody.Product_Category,
    claimType:       mapReasonToType(rawBody.Return_Reason!),
  });

  if (!policyCheck.ok) {
    return NextResponse.json(
      { refused: true, reason: policyCheck.code, message: policyCheck.message },
      { status: 200 },
    );
  }

  // 4. Score de fraude cross-boutique — lecture seule.
  //
  // Aucun enregistrement n'est créé ici : `/api/predict` est une consultation,
  // pas un évènement de retour. La création systématique de lignes vides
  // (une par appel, à email NULL) faisait grossir sans limite une table
  // interrogée par index sur email/téléphone (C-06).
  //
  // Sans identification du client, le score fourni par l'appelant est conservé
  // tel quel — il n'est plus écrasé par 0, ce qui neutralisait `Is_Suspicious`
  // et `fraud_score_bin` à chaque prédiction.
  let fraudScoreSource: "flowmerce_network" | "caller" | "default" = "caller";
  if (rawBody.customer_email || rawBody.customer_phone) {
    const fraudRecord = await findFraudRecord(rawBody.customer_email, rawBody.customer_phone);
    if (fraudRecord) {
      rawBody.Fraud_Score = computeFraudScore(fraudRecord);
      fraudScoreSource = "flowmerce_network";
    }
  }
  if (rawBody.Fraud_Score === undefined || rawBody.Fraud_Score === null) {
    rawBody.Fraud_Score = 0;
    fraudScoreSource = "default";
  }

  // 5. Enrichir l'input ML avec la politique vendeur, puis traduire le
  //    vocabulaire catégoriel vers celui appris par le modèle.
  const { enriched, warnings: policyWarnings } = enrichWithVendorPolicy(rawBody, policy);
  const mlInput = toMLPayload({
    ...enriched,
    Customer_Gender:  normalizeCustomerGender(enriched.Customer_Gender),
    Customer_Wilaya:  normalizeCustomerWilaya(enriched.Customer_Wilaya),
    Product_Category: normalizeProductCategory(enriched.Product_Category),
    Payment_Method:   normalizePaymentMethod(enriched.Payment_Method),
    Shipping_Method:  normalizeShippingMethod(enriched.Shipping_Method),
    Return_Reason:    normalizeReturnReason(enriched.Return_Reason),
  });

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
    }).catch((e) => log.error("predict.log_error", { err: String(e) })),

    prisma.apiKey.update({ where: { id: keyRecord.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => log.error("predict.api_key_update_error", { err: String(e) })),
  ]);

  return NextResponse.json(
    {
      ...mlResult.prediction,
      vendor_policy_applied: {
        return_window_days: policy?.maxClaimDays ?? 14,
        within_policy:      mlInput.Within_Return_Policy === 1,
        warnings:           policyWarnings,
      },
      fraud_score_applied: {
        value:  mlInput.Fraud_Score,
        source: fraudScoreSource,
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
    description:     "Prédiction de la résolution d'un retour",
    authentication:  "Header requis : x-api-key ou Authorization: Bearer <key>",
    required_fields: REQUIRED_FIELDS,
    optional_fields: OPTIONAL_FIELDS,
    notes: {
      vocabulary:
        "Les valeurs catégorielles sont traduites vers le vocabulaire du modèle. " +
        "Une valeur non traduisible est signalée dans `contract.unknown_categories` " +
        "de la réponse : la prédiction est alors rendue sur un vecteur partiel.",
      fraud_score:
        "Fourni `customer_email` ou `customer_phone`, le score de fraude " +
        "cross-boutique de Flowmerce remplace la valeur transmise (`source: " +
        "flowmerce_network`). Sans identification, la valeur transmise est " +
        "conservée telle quelle. Aucun enregistrement client n'est créé par cet endpoint.",
      customer_satisfaction:
        "N'appartient plus au contrat : Flowmerce ne mesure aucune satisfaction. " +
        "Le champ est ignoré s'il est envoyé.",
    },
    example_request: {
      Customer_Gender: "Female", Customer_Age: 30, Customer_Wilaya: "Alger",
      Customer_Past_Returns: 3, Shop_Name: "MonShop", Product_Category: "Electronics",
      Product_Price_DA: 15000, Order_Quantity: 1, Total_Amount_DA: 15500,
      Payment_Method: "CCP", Shipping_Method: "Yalidine", Shipping_Cost_DA: 500,
      Return_Reason: "Produit défectueux", Days_to_Return: 5, Fraud_Score: 12,
      Is_Suspicious: 0, customer_email: "client@example.com",
    },
    example_response: {
      resolution:            { prediction: "Exchange", confidence: 0.71, probabilities: { Exchange: 0.71, Repair: 0.17, Reject: 0.12 } },
      contract:              { version: "…", degraded: false, unknown_categories: {}, categorical_coverage: 1 },
      vendor_policy_applied: { return_window_days: 14, within_policy: true, warnings: [] },
      fraud_score_applied:   { value: 25, source: "flowmerce_network" },
    },
  });
}
