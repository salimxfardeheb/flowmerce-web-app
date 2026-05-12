// app/api/cron/retry-ml/route.ts
//
// Worker de reprise pour les prédictions ML qui ont échoué à la création
// de la claim (mlFailed=true). Rejoue callMLPredict depuis mlInput persisté.
//
// Déclenché par Vercel Cron (vercel.json) toutes les 10 min.
// Protection : header `Authorization: Bearer <CRON_SECRET>` (envoyé
// automatiquement par Vercel).

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callMLPredict, type MLPredictionOutput } from "@/lib/services/ml";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 6;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const stuck = await prisma.claim.findMany({
    where: {
      mlFailed:   true,
      mlAttempts: { lt: MAX_ATTEMPTS },
      mlInput:    { not: Prisma.JsonNull },
    },
    select: { id: true, mlInput: true, mlAttempts: true },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let recovered = 0;
  let stillFailing = 0;

  for (const c of stuck) {
    if (!c.mlInput || typeof c.mlInput !== "object") {
      // Edge case : claim marquée mlFailed sans mlInput → on l'abandonne
      // pour éviter de la repasser indéfiniment.
      await prisma.claim.update({
        where: { id: c.id },
        data: { mlFailed: false, mlAttempts: MAX_ATTEMPTS },
      });
      continue;
    }

    const result = await callMLPredict(c.mlInput as Record<string, unknown>);

    if (result.ok) {
      const pred = result.prediction as MLPredictionOutput;
      const probs = pred.resolution?.probabilities ?? {};
      const aiScore = Object.values(probs).length ? Math.max(...Object.values(probs)) : null;

      await prisma.claim.update({
        where: { id: c.id },
        data: {
          prediction: pred as unknown as Prisma.InputJsonValue,
          aiDecision: pred.resolution?.prediction ?? null,
          aiScore,
          mlFailed:   false,
          mlAttempts: { increment: 1 },
        },
      });
      recovered++;
    } else {
      await prisma.claim.update({
        where: { id: c.id },
        data: { mlAttempts: { increment: 1 } },
      });
      stillFailing++;
      log.warn("ml.retry.failed", { claimId: c.id, attempt: c.mlAttempts + 1, error: result.error });
    }
  }

  log.info("ml.retry.batch", { processed: stuck.length, recovered, stillFailing });

  return NextResponse.json({ processed: stuck.length, recovered, stillFailing });
}
