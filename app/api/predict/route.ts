// src/app/api/predict/route.ts
//
// Endpoint public appelé par les vendeurs avec leur clé API.
// Flux : Validation clé → Application politique → Appel FastAPI → Log → Réponse
//
// Usage vendeur :
//   POST /api/predict
//   Header: x-api-key: flw_xxxxxxxx
//   Body:   { ...ReturnRequest }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiKey } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types (miroir du schéma Pydantic FastAPI)
// ─────────────────────────────────────────────────────────────
interface ReturnRequest {
  Customer_Gender: string;
  Customer_Age: number;
  Customer_Wilaya: string;
  Customer_Past_Returns: number;
  Shop_Name: string;
  Product_Category: string;
  Product_Price_DA: number;
  Order_Quantity: number;
  Total_Amount_DA: number;
  Payment_Method: string;
  Shipping_Method: string;
  Shipping_Cost_DA: number;
  Return_Reason: string;
  Days_to_Return: number;
  Shop_Return_Window_Days: number;
  Within_Return_Policy: 0 | 1;
  Fraud_Score: number;
  Customer_Satisfaction: number;
  Is_Suspicious: 0 | 1;
  Refund_Amount_DA: number;
}

interface MLPrediction {
  resolution: {
    prediction: "Exchange" | "Refund" | "Reject" | "Repair";
    probabilities: Record<string, number>;
  };
  shipping_paid_by: {
    prediction: "Client" | "Vendeur";
    probabilities: Record<string, number>;
  };
}

// ─────────────────────────────────────────────────────────────
// Validation des champs requis
// ─────────────────────────────────────────────────────────────
const REQUIRED_FIELDS: (keyof ReturnRequest)[] = [
  "Customer_Gender",
  "Customer_Age",
  "Customer_Wilaya",
  "Customer_Past_Returns",
  "Shop_Name",
  "Product_Category",
  "Product_Price_DA",
  "Order_Quantity",
  "Total_Amount_DA",
  "Payment_Method",
  "Shipping_Method",
  "Shipping_Cost_DA",
  "Return_Reason",
  "Days_to_Return",
  "Fraud_Score",
  "Customer_Satisfaction",
  "Is_Suspicious",
  "Refund_Amount_DA",
];

function validateInput(body: Partial<ReturnRequest>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return `Champ manquant ou invalide : ${field}`;
    }
  }
  if (body.Fraud_Score! < 0 || body.Fraud_Score! > 100)
    return "Fraud_Score doit être entre 0 et 100";
  if (body.Customer_Satisfaction! < 1 || body.Customer_Satisfaction! > 5)
    return "Customer_Satisfaction doit être entre 1 et 5";
  if (body.Is_Suspicious !== 0 && body.Is_Suspicious !== 1)
    return "Is_Suspicious doit être 0 ou 1";
  return null;
}

// ─────────────────────────────────────────────────────────────
// Logique de politique vendeur
// Enrichit / surcharge l'input ML avec les règles du vendeur
// ─────────────────────────────────────────────────────────────
function applyVendorPolicy(
  input: Partial<ReturnRequest>,
  policy: {
    maxClaimDays: number;
    fraudScoreThreshold?: number | null;
    nonRefundableCategories?: string[];
    exchangeOnlyCategories?: string[];
    acceptedReturnReasons?: string[];
    acceptedTypes?: string[];
  } | null
): { input: ReturnRequest; policyWarnings: string[]; policyRejected: boolean; rejectionReason?: string } {
  const warnings: string[] = [];
  const enriched = { ...input } as ReturnRequest;

  if (!policy) return { input: enriched, policyWarnings: warnings, policyRejected: false };

  // Injecter la fenêtre de retour du vendeur
  enriched.Shop_Return_Window_Days = policy.maxClaimDays;

  // Calculer Within_Return_Policy automatiquement
  enriched.Within_Return_Policy =
    enriched.Days_to_Return <= policy.maxClaimDays ? 1 : 0;

  // Vérifier le seuil de fraude du vendeur
  const fraudThreshold = policy.fraudScoreThreshold ?? 70;
  if (enriched.Fraud_Score >= fraudThreshold) {
    enriched.Is_Suspicious = 1;
    warnings.push(
      `Fraud_Score (${enriched.Fraud_Score}) dépasse le seuil vendeur (${fraudThreshold}) — marqué comme suspect`
    );
  }

  // Catégorie non remboursable → rejet bloquant (CRIT-7)
  const nonRefundable = policy.nonRefundableCategories ?? [];
  if (nonRefundable.includes(enriched.Product_Category)) {
    return {
      input: enriched,
      policyWarnings: warnings,
      policyRejected: true,
      rejectionReason: `Catégorie "${enriched.Product_Category}" non remboursable selon la politique vendeur`,
    };
  }

  // Raison non acceptée → rejet bloquant (CRIT-7)
  const acceptedReasons = policy.acceptedReturnReasons ?? [];
  if (acceptedReasons.length > 0 && !acceptedReasons.includes(enriched.Return_Reason)) {
    return {
      input: enriched,
      policyWarnings: warnings,
      policyRejected: true,
      rejectionReason: `Raison "${enriched.Return_Reason}" non acceptée par la politique vendeur`,
    };
  }

  return { input: enriched, policyWarnings: warnings, policyRejected: false };
}

// ─────────────────────────────────────────────────────────────
// POST /api/predict
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Extraire la clé API (header x-api-key ou Authorization: Bearer)
  const rawKey =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;

  if (!rawKey) {
    return NextResponse.json(
      {
        error: "Clé API manquante",
        hint: "Ajoutez le header : x-api-key: votre_cle",
      },
      { status: 401 }
    );
  }

  // 2. Valider la clé dans la base de données
  let keyRecord;
  try {
    keyRecord = await prisma.apiKey.findUnique({
      where: { key: hashApiKey(rawKey) },
      include: {
        vendor: {
          include: {
            returnPolicy: true,
          },
        },
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur de base de données" },
      { status: 500 }
    );
  }

  if (!keyRecord) {
    return NextResponse.json({ error: "Clé API introuvable" }, { status: 403 });
  }

  if (!keyRecord.isActive) {
    return NextResponse.json(
      { error: "Clé API désactivée", hint: "Générez une nouvelle clé dans votre dashboard" },
      { status: 403 }
    );
  }

  if (keyRecord.vendor.status !== "APPROVED") {
    return NextResponse.json(
      {
        error: "Compte vendeur non approuvé",
        status: keyRecord.vendor.status,
      },
      { status: 403 }
    );
  }

  // 3. Parser le body
  let rawBody: Partial<ReturnRequest>;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON invalide" },
      { status: 400 }
    );
  }

  // 4. Valider les champs requis
  const validationError = validateInput(rawBody);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  // 5. Appliquer la politique du vendeur
  const { input: mlInput, policyWarnings, policyRejected, rejectionReason } = applyVendorPolicy(
    rawBody,
    keyRecord.vendor.returnPolicy as any
  );

  if (policyRejected) {
    return NextResponse.json(
      {
        resolution: { prediction: "Reject", probabilities: {} },
        shipping_paid_by: { prediction: "Client", probabilities: {} },
        vendor_policy_applied: {
          return_window_days: keyRecord.vendor.returnPolicy?.maxClaimDays ?? 14,
          within_policy: false,
          warnings: policyWarnings,
          rejected_by_policy: true,
          rejection_reason: rejectionReason,
        },
      },
      { status: 422 }
    );
  }

  // 6. Appeler le FastAPI Python
  const mlApiUrl = process.env.ML_API_URL ?? "http://localhost:8000";
  let prediction: MLPrediction;

  try {
    const mlRes = await fetch(`${mlApiUrl}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Clé interne entre Next.js et FastAPI (optionnel mais recommandé)
        ...(process.env.ML_INTERNAL_SECRET
          ? { "X-Internal-Key": process.env.ML_INTERNAL_SECRET }
          : {}),
      },
      body: JSON.stringify(mlInput),
      // Timeout 10s
      signal: AbortSignal.timeout(10_000),
    });

    if (!mlRes.ok) {
      const errBody = await mlRes.json().catch(() => ({}));
      console.error("[predict] FastAPI error:", errBody);
      return NextResponse.json(
        { error: "Erreur du modèle ML", detail: errBody },
        { status: 502 }
      );
    }

    prediction = await mlRes.json();
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Le modèle ML n'a pas répondu dans les délais (10s)" },
        { status: 504 }
      );
    }
    console.error("[predict] Network error:", err);
    return NextResponse.json(
      { error: "Impossible de joindre le service ML", detail: err?.message },
      { status: 503 }
    );
  }

  // 7. Logger la prédiction et mettre à jour lastUsedAt (en parallèle)
  await Promise.all([
    prisma.predictionLog
      .create({
        data: {
          vendorId: keyRecord.vendorId,
          input: mlInput as any,
          output: prediction as any,
        },
      })
      .catch((e) => console.error("[predict] Log error:", e)),

    prisma.apiKey
      .update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((e) => console.error("[predict] lastUsedAt update error:", e)),
  ]);

  // 8. Enrichir la réponse avec les avertissements de politique
  return NextResponse.json(
    {
      ...prediction,
      vendor_policy_applied: {
        return_window_days: keyRecord.vendor.returnPolicy?.maxClaimDays ?? 14,
        within_policy: mlInput.Within_Return_Policy === 1,
        warnings: policyWarnings,
      },
    },
    { status: 200 }
  );
}

// ─────────────────────────────────────────────────────────────
// GET /api/predict  → documentation inline
// ─────────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/predict",
    description: "Prédiction de résolution et du payeur des frais de retour",
    authentication: "Header requis : x-api-key ou Authorization: Bearer <key>",
    required_fields: REQUIRED_FIELDS,
    example_request: {
      Customer_Gender: "Female",
      Customer_Age: 30,
      Customer_Wilaya: "Alger",
      Customer_Past_Returns: 3,
      Shop_Name: "MonShop",
      Product_Category: "Electronics",
      Product_Price_DA: 15000,
      Order_Quantity: 1,
      Total_Amount_DA: 15500,
      Payment_Method: "CCP",
      Shipping_Method: "Standard",
      Shipping_Cost_DA: 500,
      Return_Reason: "Defective",
      Days_to_Return: 5,
      Fraud_Score: 12,
      Customer_Satisfaction: 4,
      Is_Suspicious: 0,
      Refund_Amount_DA: 15000,
    },
    example_response: {
      resolution: {
        prediction: "Refund",
        probabilities: { Exchange: 0.12, Refund: 0.71, Reject: 0.09, Repair: 0.08 },
      },
      shipping_paid_by: {
        prediction: "Vendeur",
        probabilities: { Client: 0.23, Vendeur: 0.77 },
      },
      vendor_policy_applied: {
        return_window_days: 14,
        within_policy: true,
        warnings: [],
      },
    },
  });
}