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
