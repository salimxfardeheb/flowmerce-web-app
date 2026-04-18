import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/vendors/documents/view?id=<documentId>
 * Sert le fichier inline dans le navigateur (PDF ou image).
 * Les fichiers sont uploadés en access_mode "public" sur Cloudinary,
 * donc on utilise directement l'URL stockée — pas besoin de signed URL.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user as any;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const documentId = req.nextUrl.searchParams.get("id");
  if (!documentId)
    return NextResponse.json({ error: "Paramètre id requis" }, { status: 400 });

  const doc = await prisma.document.findUnique({
    where:  { id: documentId },
    select: { url: true, name: true, id: true },
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

  // ── Fichiers Cloudinary publics : proxy direct ────────────────
  // Les fichiers sont uploadés avec access_mode:"public"
  // → l'URL stockée est directement accessible, pas besoin de signature.
  const isPdf =
    storedUrl.includes("/raw/upload/") ||
    storedUrl.toLowerCase().includes(".pdf");

  return proxyAndServe(storedUrl, doc.name, isPdf);
}

// ── Fetcher le fichier et le servir inline ────────────────────
async function proxyAndServe(
  url: string,
  filename: string | null,
  isPdf: boolean
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // Certains CDN exigent un User-Agent
        "User-Agent": "Flowmerce-Admin/1.0",
      },
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
      "Cache-Control":       "private, max-age=3600",
    },
  });
}

function htmlPage(title: string, line1: string, line2: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
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
      <h2>${title}</h2>
      <p>${line1}</p>
      ${line2 ? `<p>${line2}</p>` : ""}
    </div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}