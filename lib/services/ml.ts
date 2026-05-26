import { env } from '@/lib/env'
import { log } from '@/lib/logger'

export interface MLPredictionOutput {
  resolution: {
    prediction:    string;
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
