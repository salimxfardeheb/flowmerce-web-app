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
  | { ok: false; timedOut: boolean; error: string };

export async function callMLPredict(
  input:     object,
  timeoutMs  = 8_000,
): Promise<MLResult> {
  const mlApiUrl = process.env.ML_API_URL;
  if (!mlApiUrl) return { ok: false, timedOut: false, error: 'ML_API_URL not configured' };

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${mlApiUrl}/predict`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ML_INTERNAL_SECRET
          ? { 'X-Internal-Key': process.env.ML_INTERNAL_SECRET }
          : {}),
      },
      body:   JSON.stringify(input),
      signal: controller.signal,
    });
    clearTimeout(timerId);

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      return { ok: false, timedOut: false, error: JSON.stringify(detail) };
    }

    const prediction = (await res.json()) as MLPredictionOutput;
    return { ok: true, prediction };
  } catch (err: unknown) {
    clearTimeout(timerId);
    const name = (err as { name?: string })?.name;
    return {
      ok:       false,
      timedOut: name === 'AbortError' || name === 'TimeoutError',
      error:    String((err as { message?: string })?.message ?? err),
    };
  }
}
