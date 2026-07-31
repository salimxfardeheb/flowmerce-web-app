// app/api/admin/claims/save-claim/route.ts
//
// Envoi d'une réclamation vers le serveur ML (FastAPI /save_claim).
// Flux : Admin UI → cette route (serveur) → FastAPI /save_claim.
//
// La route est la seule à connaître ML_API_URL et ML_INTERNAL_SECRET ;
// le secret ne quitte jamais le serveur.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { callMLSaveClaim } from "@/lib/services/ml";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { error: "Payload invalide : un objet ReclamationInput est attendu." },
      { status: 422 },
    );
  }

  const result = await callMLSaveClaim(payload as Parameters<typeof callMLSaveClaim>[0]);

  if (!result.ok) {
    log.error("admin.save_claim_failed", {
      error:    result.error,
      timedOut: result.timedOut,
      status:   result.status,
    });

    if (result.timedOut) {
      return NextResponse.json(
        { error: "Le serveur ML n'a pas répondu dans les délais.", mlServerDown: true },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error: "Le serveur ML a rejeté la réclamation.",
        mlServerDown: result.status === undefined,
        detail: result.error,
      },
      { status: result.status ?? 502 },
    );
  }

  return NextResponse.json(
    { success: true, message: result.message, order_id: result.order_id },
    { status: 201 },
  );
}
