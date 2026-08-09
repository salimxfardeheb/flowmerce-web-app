import { env } from '@/lib/env'
import { log } from '@/lib/logger'
import { isAIDecision, type AIDecision } from '@/lib/constants'

export interface MLPredictionOutput {
  resolution: {
    // Contrat 3 classes : l'API ML ne renvoie jamais 'Refund'.
    prediction:    AIDecision;
    probabilities: Record<string, number>;
  };
  shipping_paid_by?: {
    prediction:    string;
    probabilities: Record<string, number>;
  };
}

export type MLResult =
  | { ok: true;  prediction: MLPredictionOutput }
  | { ok: false; timedOut: boolean; error: string; retryable: boolean; attempts: number }

interface CallOptions {
  retries?:   number
  timeoutMs?: number
}

async function attempt(input: object, timeoutMs: number): Promise<MLResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${env.ML_API_URL}/predict`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': env.ML_INTERNAL_SECRET,
      },
      body:   JSON.stringify(input),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      return {
        ok:        false,
        timedOut:  false,
        error:     `HTTP ${res.status} ${JSON.stringify(detail)}`,
        retryable: res.status >= 500 || res.status === 429,
        attempts:  1,
      }
    }

    const prediction = (await res.json()) as MLPredictionOutput

    // Contrat 3 classes : toute autre valeur (dont 'Refund') est une violation
    // du contrat ML → on traite la réponse comme un échec (mlFailed), sans
    // retry immédiat (rejouer le même input renverrait la même classe).
    const predicted = prediction?.resolution?.prediction
    if (!isAIDecision(predicted)) {
      log.error('ml.invalid_prediction_class', {
        prediction: String(predicted),
        expected:   'Exchange | Repair | Reject',
      })
      return {
        ok:        false,
        timedOut:  false,
        error:     `invalid_prediction_class: ${String(predicted)}`,
        retryable: false,
        attempts:  1,
      }
    }

    return { ok: true, prediction }
  } catch (err: unknown) {
    const name     = (err as { name?: string })?.name
    const timedOut = name === 'AbortError' || name === 'TimeoutError'
    return {
      ok:        false,
      timedOut,
      error:     String((err as { message?: string })?.message ?? err),
      retryable: true,
      attempts:  1,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─────────────────────────────────────────────────────────────
// Construction du payload ML à partir des données métier d'une réclamation.
// Source unique de vérité du format ML — utilisé par /claims/create et
// /return/[token]. Fraud_Score, Customer_Past_Returns et Is_Suspicious
// sont des placeholders : ils sont recalculés à l'intérieur d'ingestClaim
// avant l'envoi effectif (cf. claim-ingestion.ts).
// ─────────────────────────────────────────────────────────────
export interface BuildMLPayloadInput {
  customerId:         string | null
  shopName:           string
  productCategory:    string | null
  productPrice:       number | null
  productQuantity:    number | null
  orderTotal:         number | null
  paymentMethod:      string
  shippingMethod:     string
  shippingCost:       number
  customerGender:     string
  customerAge:        number | null
  customerWilaya:     string
  reason:             string
  daysToReturn:       number
  returnWindowDays:   number
}

export interface MLPayload {
  Customer_ID:             string
  Customer_Gender:         string
  Customer_Age:            number
  Customer_Wilaya:         string
  Customer_Past_Returns:   number
  Shop_Name:               string
  Product_Category:        string
  Product_Price_DA:        number
  Order_Quantity:          number
  Total_Amount_DA:         number
  Payment_Method:          string
  Shipping_Method:         string
  Shipping_Cost_DA:        number
  Return_Reason:           string
  Days_to_Return:          number
  Shop_Return_Window_Days: number
  Within_Return_Policy:    1
  Fraud_Score:             number
  Customer_Satisfaction:   number
  Is_Suspicious:           0 | 1
}

export function buildMLPayload(input: BuildMLPayloadInput): MLPayload {
  return {
    Customer_ID:             input.customerId ?? '',
    Customer_Gender:         input.customerGender,
    Customer_Age:            input.customerAge ?? 0,
    Customer_Wilaya:         input.customerWilaya,
    Customer_Past_Returns:   0, // recalculé par ingestClaim
    Shop_Name:               input.shopName,
    Product_Category:        input.productCategory ?? 'Unknown',
    Product_Price_DA:        input.productPrice ?? input.orderTotal ?? 1,
    Order_Quantity:          input.productQuantity ?? 1,
    Total_Amount_DA:         input.orderTotal ?? input.productPrice ?? 1,
    Payment_Method:          input.paymentMethod,
    Shipping_Method:         input.shippingMethod,
    Shipping_Cost_DA:        input.shippingCost,
    Return_Reason:           input.reason,
    Days_to_Return:          input.daysToReturn,
    Shop_Return_Window_Days: input.returnWindowDays,
    Within_Return_Policy:    1,
    Fraud_Score:             0, // recalculé par ingestClaim
    Customer_Satisfaction:   3,
    Is_Suspicious:           0, // recalculé par ingestClaim
  }
}

// ─────────────────────────────────────────────────────────────
// /save_claim — Insertion d'une réclamation réelle côté ML.
// Source unique de vérité du contrat : le modèle Pydantic
// `ReclamationInput` (api/server.py). Les champs sont envoyés
// tels quels, sans recalcul.
//
// `Return_Shipping_Paid_By` et `Refund_Amount_DA` ne font PAS partie du
// contrat : aucun point d'entrée Flowmerce ne les collecte, ils ne valaient
// donc que la valeur neutre ('' / 0) et polluaient le dataset.
// ─────────────────────────────────────────────────────────────
export interface ReclamationInput {
  Order_ID:                 string
  Customer_ID:               string
  Customer_Age:              number
  Customer_Gender:           string
  Customer_Wilaya:           string
  Customer_Past_Returns:     number
  Shop_Name:                 string
  Product_Category:          string
  Product_Name:              string
  Product_Price_DA:          number
  Order_Quantity:            number
  Total_Amount_DA:           number
  Payment_Method:            string
  Shipping_Method:           string
  Shipping_Cost_DA:          number
  Order_Date:                 string
  Return_Date:                 string
  Days_to_Return:              number
  Shop_Return_Window_Days:     number
  Within_Return_Policy:        0 | 1
  Return_Reason:               string
  Resolution:                   'Exchange' | 'Reject' | 'Repair' | 'Refund'
  Fraud_Score:                   number
  Is_Suspicious:                  0 | 1
  Customer_Satisfaction?:         number | null
}

export type MLSaveClaimResult =
  | { ok: true;  message: string; order_id: string }
  | { ok: false; timedOut: boolean; error: string; status?: number }

// ─────────────────────────────────────────────────────────────
// Construction du payload ReclamationInput à partir d'une claim
// Flowmerce pour l'export global vers /save_claim.
// Utilise le mlInput persisté tel quel en complétant les champs
// requis absents avec les données de la claim (productName,
// orderDate, type) et des valeurs neutres (0, chaîne vide, date
// du jour). Aucun recalcul.
//
// Exception : les colonnes reprises ci-dessous directement du
// modèle Prisma `Claim` priment sur mlInput, la base faisant foi.
//   - Order_ID    ← claim.orderId
//   - Customer_ID ← claim.customerId
//   - Fraud_Score ← claim.fraudScore
// ─────────────────────────────────────────────────────────────
export interface BuildReclamationInputFromClaimInput {
  orderId: string
  customerId?: string | null
  fraudScore?: number | null
  productName: string | null
  orderDate: Date | null
  // Date de dépôt de la réclamation — sert de Return_Date quand le mlInput
  // persisté n'en contient pas (le formulaire ne collecte pas ce champ).
  createdAt?: Date | null
  type: 'EXCHANGE' | 'REFUND' | 'REPAIR' | null
  aiDecision: string | null
  vendor: { companyName: string }
  mlInput: Record<string, unknown> | null
}

export const TYPE_TO_RESOLUTION = {
  EXCHANGE: 'Exchange',
  REFUND:   'Refund',
  REPAIR:   'Repair',
} as const

function toNum(v: unknown, fallback: number): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function toFlag(v: unknown, fallback: 0 | 1): 0 | 1 {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1
  if (v === false || v === 0 || v === '0' || v === 'false') return 0
  return fallback
}

function toDateStr(v: unknown, fallback: string): string {
  if (v === null || v === undefined || v === '') return fallback
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10)
}

export function buildReclamationInputFromClaim(
  claim: BuildReclamationInputFromClaimInput,
): ReclamationInput {
  const ml  = claim.mlInput ?? {}
  const mlv = ml as Record<string, unknown>
  const today = new Date().toISOString().slice(0, 10)

  const shownResolution = claim.aiDecision ?? mlv.Resolution ?? null
  const resolution: ReclamationInput['Resolution'] =
    shownResolution === 'Exchange' ||
    shownResolution === 'Reject' ||
    shownResolution === 'Repair' ||
    shownResolution === 'Refund'
      ? shownResolution
      : claim.type
        ? TYPE_TO_RESOLUTION[claim.type]
        : 'Refund'

  return {
    // Colonne DB `Claim.orderId` : seule source de vérité. Elle est validée et
    // trimée aux trois points d'entrée (/claims/create, /return/[token],
    // /v1/returns) et sert de clé de déduplication (vendorId, orderId).
    // `mlInput` n'est volontairement pas consulté : c'est un blob JSONB figé à
    // la création, qui ne porte pas Order_ID et ne doit pas primer sur la base.
    Order_ID:                 claim.orderId,
    // Colonne DB `Claim.customerId` (identifiant client côté boutique) : elle
    // fait foi ; `mlInput.Customer_ID` sert de repli pour les claims créées
    // avant l'ajout de la colonne.
    Customer_ID:               String(claim.customerId ?? mlv.Customer_ID ?? ''),
    Customer_Age:              toNum(mlv.Customer_Age, 0),
    Customer_Gender:           String(mlv.Customer_Gender ?? 'Unknown'),
    Customer_Wilaya:           String(mlv.Customer_Wilaya ?? 'Unknown'),
    Customer_Past_Returns:     toNum(mlv.Customer_Past_Returns, 0),
    Shop_Name:                 String(mlv.Shop_Name ?? claim.vendor.companyName),
    Product_Category:          String(mlv.Product_Category ?? 'Unknown'),
    Product_Name:              String(mlv.Product_Name ?? claim.productName ?? ''),
    Product_Price_DA:          toNum(mlv.Product_Price_DA, 1),
    Order_Quantity:            toNum(mlv.Order_Quantity, 1),
    Total_Amount_DA:           toNum(mlv.Total_Amount_DA, 1),
    Payment_Method:            String(mlv.Payment_Method ?? 'Unknown'),
    Shipping_Method:           String(mlv.Shipping_Method ?? 'Standard'),
    Shipping_Cost_DA:          toNum(mlv.Shipping_Cost_DA, 0),
    Order_Date:                toDateStr(
      mlv.Order_Date,
      claim.orderDate ? toDateStr(claim.orderDate.toISOString(), today) : today,
    ),
    Return_Date:               toDateStr(
      mlv.Return_Date,
      claim.createdAt ? toDateStr(claim.createdAt.toISOString(), today) : today,
    ),
    Days_to_Return:            toNum(mlv.Days_to_Return, 0),
    Shop_Return_Window_Days:   toNum(mlv.Shop_Return_Window_Days, 14),
    Within_Return_Policy:      toFlag(mlv.Within_Return_Policy, 1),
    Return_Reason:             String(mlv.Return_Reason ?? ''),
    Resolution:                resolution,
    // Colonne DB `Claim.fraudScore` : calculée à l'ingestion par
    // computeFraudScore() et stockée sur la claim — c'est elle qui fait foi.
    // `mlInput.Fraud_Score` (figé à la création) n'est qu'un repli.
    Fraud_Score:               toNum(claim.fraudScore ?? mlv.Fraud_Score, 0),
    Is_Suspicious:             toFlag(mlv.Is_Suspicious, 0),
    Customer_Satisfaction:
      mlv.Customer_Satisfaction === null ||
      mlv.Customer_Satisfaction === undefined ||
      mlv.Customer_Satisfaction === ''
        ? null
        : toNum(mlv.Customer_Satisfaction, 3),
  }
}

export async function callMLSaveClaim(
  input: ReclamationInput,
  timeoutMs = 10_000,
): Promise<MLSaveClaimResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${env.ML_API_URL}/save_claim`, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-Internal-Key': env.ML_INTERNAL_SECRET,
      },
      body:   JSON.stringify(input),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}))
      return {
        ok:        false,
        timedOut:  false,
        error:     `HTTP ${res.status} ${JSON.stringify(detail)}`,
        status:    res.status,
      }
    }

    const data = (await res.json()) as { message?: string; order_id?: string }
    return {
      ok:       true,
      message:  data.message ?? 'ok',
      order_id: data.order_id ?? input.Order_ID,
    }
  } catch (err: unknown) {
    const name     = (err as { name?: string })?.name
    const timedOut = name === 'AbortError' || name === 'TimeoutError'
    return {
      ok:        false,
      timedOut,
      error:     String((err as { message?: string })?.message ?? err),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function callMLPredict(
  input: object,
  opts:  CallOptions = {},
): Promise<MLResult> {
  const retries   = opts.retries   ?? 2
  const timeoutMs = opts.timeoutMs ?? 4_000

  let last: MLResult = { ok: false, timedOut: false, error: 'no_attempt', retryable: false, attempts: 0 }

  for (let i = 0; i <= retries; i++) {
    const r = await attempt(input, timeoutMs)
    if (r.ok) return r

    last = { ...r, attempts: i + 1 }
    if (!r.retryable || i === retries) break

    const backoff = 250 * 2 ** i + Math.floor(Math.random() * 100)
    log.warn('ml.retry', { attempt: i + 1, nextDelayMs: backoff, error: r.error })
    await new Promise<void>((resolve) => setTimeout(resolve, backoff))
  }

  return last
}
