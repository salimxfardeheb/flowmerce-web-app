import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSignedUrl } from "@/lib/storage";
import { log } from "@/lib/logger";

const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const documentId = req.nextUrl.searchParams.get("id");
  if (!documentId)
    return NextResponse.json({ error: "Paramètre id requis" }, { status: 400 });

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { storagePath: true, name: true, id: true },
  });

  if (!doc)
    return NextResponse.json(
      { error: "Document introuvable" },
      { status: 404 },
    );

  let signedUrl: string;
  try {
    signedUrl = await getSignedUrl(doc.storagePath, SIGNED_URL_TTL_SECONDS);
  } catch (err) {
    log.error("documents.view_signed_url_error", {
      err: String(err),
      documentId,
    });
    return htmlPage(
      "Erreur",
      "Impossible de générer le lien du document.",
      "Vérifiez que le fichier existe dans Supabase Storage.",
    );
  }

  return NextResponse.redirect(signedUrl);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function htmlPage(title: string, line1: string, line2: string): NextResponse {
  const t = escapeHtml(title);
  const l1 = escapeHtml(line1);
  const l2 = escapeHtml(line2);
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t}</title>
    <style>
      body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
           height:100vh;margin:0;background:#f9fafb}
      .box{text-align:center;padding:2rem;border:1px solid #e5e7eb;border-radius:12px;
           background:white;max-width:420px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
      h2{color:#374151;margin:.5rem 0}
      p{color:#6b7280;font-size:.875rem;margin:.25rem 0}
      .icon{font-size:2.5rem;margin-bottom:.5rem}
    </style></head><body>
    <div class="box">
      <div class="icon">⚠️</div>
      <h2>${t}</h2>
      <p>${l1}</p>
      ${l2 ? `<p>${l2}</p>` : ""}
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
