// app/api/cron/retry-ml/route.ts
//
// Worker de reprise pour les prédictions ML qui ont échoué à la création
// de la claim (mlFailed=true). Rejoue callMLPredict depuis mlInput persisté,
// puis applique la décision métier — statut, notification — via le MÊME
// service que le chemin nominal (`applyMLDecision`).
//
// Avant correction (C-05), cette route écrivait la prédiction sans jamais
// écrire `status` ni notifier : un `Reject` obtenu par reprise laissait la
// réclamation `PENDING` indéfiniment, et une approbation AI_AUTO n'était
// jamais appliquée.
//
// Déclenché par Vercel Cron (vercel.json) toutes les 10 min.
// Protection : header `Authorization: Bearer <CRON_SECRET>` (envoyé
// automatiquement par Vercel).

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callMLPredict } from "@/lib/services/ml";
import { applyMLDecision } from "@/lib/services/claim-decision";
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
    select: {
      id:            true,
      mlInput:       true,
      mlAttempts:    true,
      vendorId:      true,
      status:        true,
      type:          true,
      orderDate:     true,
      prediction:    true,
      customerName:  true,
      customerEmail: true,
      customerPhone: true,
      orderId:       true,
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let recovered = 0;
  let stillFailing = 0;
  let alreadyResolved = 0;

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

    const result = await callMLPredict(c.mlInput as Record<string, unknown>, {
      context: { claimId: c.id, vendorId: c.vendorId, origin: "retry" },
    });

    if (result.ok) {
      // Même service que l'ingestion : la reprise mène exactement au même état
      // final qu'une soumission dont le ML aurait répondu du premier coup.
      // `applied: false` = la réclamation avait déjà été tranchée entre-temps
      // (vendeur, ou exécution concurrente du cron) : rien n'est réécrit et
      // aucune notification n'est renvoyée.
      const outcome = await applyMLDecision(
        {
          id:            c.id,
          vendorId:      c.vendorId,
          status:        c.status,
          type:          c.type,
          orderDate:     c.orderDate,
          prediction:    c.prediction,
          customerName:  c.customerName,
          customerEmail: c.customerEmail,
          customerPhone: c.customerPhone,
          orderId:       c.orderId,
        },
        result.prediction,
        { origin: "retry" },
      );

      if (outcome.applied) recovered++;
      else alreadyResolved++;
    } else {
      await prisma.claim.update({
        where: { id: c.id },
        data: { mlAttempts: { increment: 1 } },
      });
      stillFailing++;
      log.warn("ml.retry.failed", { claimId: c.id, attempt: c.mlAttempts + 1, error: result.error });
    }
  }

  log.info("ml.retry.batch", {
    processed: stuck.length,
    recovered,
    stillFailing,
    alreadyResolved,
  });

  return NextResponse.json({
    processed: stuck.length,
    recovered,
    stillFailing,
    alreadyResolved,
  });
}
