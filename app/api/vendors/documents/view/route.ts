import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";

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
    where:  { id: documentId },
    select: { url: true, name: true, id: true, cloudinaryPublicId: true },
  });

  if (!doc)
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  const storedUrl = doc.url;

  // ── Anciens fichiers locaux (avant Cloudinary) ────────────────
  if (!storedUrl.startsWith("http")) {
    return htmlPage(
      "⚠️ Fichier ancien",
      "Ce document a été soumis avant la migration vers Cloudinary.",
      "Demandez au vendeur de le re-soumettre."
    );
  }

  const isPdf =
    storedUrl.includes("/raw/") ||
    storedUrl.toLowerCase().endsWith(".pdf");

  // ── Nouveaux docs (authenticated) : signed URL courte durée ──
  if (doc.cloudinaryPublicId) {
    const resourceType: "image" | "raw" = storedUrl.includes("/raw/") ? "raw" : "image";
    const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;

    const signedUrl = cloudinary.utils.url(doc.cloudinaryPublicId, {
      sign_url:      true,
      type:          "authenticated",
      resource_type: resourceType,
      expires_at:    expiresAt,
      secure:        true,
    });

    return proxyAndServe(signedUrl, doc.name, isPdf);
  }

  // ── Anciens docs (public, accès direct) : proxy direct ───────
  return proxyAndServe(storedUrl, doc.name, isPdf);
}

const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\//;

async function proxyAndServe(
  url: string,
  filename: string | null,
  isPdf: boolean
): Promise<NextResponse> {
  if (!CLOUDINARY_URL_RE.test(url)) {
    return htmlPage("Accès refusé", "URL de document invalide.", "");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Flowmerce-Admin/1.0" },
    });
  } catch (err) {
    console.error("[documents/view] fetch error:", err);
    return htmlPage("Erreur réseau", "Impossible de contacter Cloudinary.", "");
  }

  if (!res.ok) {
    console.error("[documents/view] Cloudinary responded:", res.status, url);
    return htmlPage(
      `Erreur ${res.status}`,
      "Impossible de récupérer ce fichier.",
      "Vérifiez que le fichier existe sur Cloudinary ou demandez au vendeur de le re-soumettre."
    );
  }

  const contentType = isPdf
    ? "application/pdf"
    : res.headers.get("content-type") ?? "application/octet-stream";

  const safeFilename = encodeURIComponent(filename ?? "document");
  const body = await res.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `inline; filename="${safeFilename}"`,
      "Cache-Control":       "private, no-store",
    },
  });
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
  const t  = escapeHtml(title);
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
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
