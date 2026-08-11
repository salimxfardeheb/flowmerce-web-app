// app/api/admin/claims/export/route.ts
//
// Export global vers le dataset ML (FastAPI /save_claim).
// Récupère toutes les claims jamais exportées (exportedToML=false),
// les envoie une à une, marque chaque succès (HTTP 201) comme exporté,
// continue en cas d'échec, et streame la progression au client.
//
// Réponse : stream NDJSON ({type:'progress'|'done', ...}).
// Le secret X-Internal-Key reste côté serveur (cf. callMLSaveClaim).

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildReclamationInputFromClaim,
  callMLSaveClaim,
  GROUND_TRUTH_SOURCES,
} from "@/lib/services/ml";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

function enqueue(controller: ReadableStreamDefaultController<Uint8Array>, line: object) {
  controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
}

export async function POST() {
  const session = await auth();
  if (!session)
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  const user = session.user;
  if (user?.role !== "ADMIN")
    return new Response(JSON.stringify({ error: "Accès refusé" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

  // Seules les réclamations dont la résolution a une origine hors modèle sont
  // exportées vers le dataset d'entraînement (C-04). Une auto-approbation
  // AI_AUTO ou un auto-rejet sur `Reject` porte la prédiction du modèle : la
  // réexporter comme vérité terrain rendait le réentraînement auto-confirmant.
  //
  // Ces réclamations ne sont pas perdues : elles restent `exportedToML: false`
  // et deviendront exportables dès qu'un vendeur ou un admin aura tranché.
  const claims = await prisma.claim.findMany({
    where: {
      exportedToML:     false,
      resolutionSource: { in: [...GROUND_TRUTH_SOURCES] },
    },
    select: {
      id:               true,
      orderId:          true,
      customerId:       true,
      fraudScore:       true,
      productName:      true,
      orderDate:        true,
      createdAt:        true,
      type:             true,
      aiDecision:       true,
      resolutionSource: true,
      mlInput:          true,
      vendor:           { select: { companyName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Compteur d'information : combien de réclamations attendent une décision
  // humaine avant de pouvoir servir de vérité terrain.
  const awaitingGroundTruth = await prisma.claim.count({
    where: {
      exportedToML: false,
      OR: [
        { resolutionSource: null },
        { resolutionSource: "MODEL" },
      ],
    },
  });

  const total = claims.length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let exported = 0;
      let failed = 0;
      let ignored = 0;
      let processed = 0;

      enqueue(controller, {
        type: "progress", processed, total, exported, failed, ignored,
        awaitingGroundTruth,
      });

      for (const c of claims) {
        const hasMlInput =
          !!c.mlInput && typeof c.mlInput === "object" && !Array.isArray(c.mlInput);

        if (!hasMlInput) {
          // "Ignorées" : claims sans mlInput (aucune donnée ML à exporter).
          ignored++;
          processed++;
          enqueue(controller, { type: "progress", processed, total, exported, failed, ignored });
          continue;
        }

        try {
          const payload = buildReclamationInputFromClaim({
            orderId:          c.orderId,
            customerId:       c.customerId,
            fraudScore:       c.fraudScore,
            productName:      c.productName,
            orderDate:        c.orderDate,
            createdAt:        c.createdAt,
            type:             c.type,
            aiDecision:       c.aiDecision,
            resolutionSource: c.resolutionSource,
            vendor:           c.vendor,
            mlInput:          c.mlInput as Record<string, unknown>,
          });

          const result = await callMLSaveClaim(payload);

          if (result.ok) {
            await prisma.claim.update({
              where: { id: c.id },
              data:  { exportedToML: true, exportedAt: new Date() },
            });
            exported++;
          } else {
            failed++;
            log.warn("admin.export_claim_failed", {
              claimId: c.id,
              error:   result.error,
              status:  result.status,
            });
          }
        } catch (err) {
          failed++;
          log.error("admin.export_claim_error", {
            claimId: c.id,
            err:     String(err),
          });
        }

        processed++;
        enqueue(controller, { type: "progress", processed, total, exported, failed, ignored });
      }

      enqueue(controller, {
        type: "done", exported, failed, ignored, total,
        awaitingGroundTruth,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
