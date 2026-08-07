// app/api/admin/claims/route.ts
//
// Alimente la table admin des réclamations. La ligne renvoyée est construite
// avec `buildReclamationInputFromClaim` — exactement la même dérivation que
// /api/admin/claims/export : l'admin voit donc à l'écran la ligne qui sera
// réellement envoyée à /save_claim, pas le `mlInput` brut (qui ne contient
// ni Order_ID, ni Product_Name, ni les dates).

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildReclamationInputFromClaim,
  TYPE_TO_RESOLUTION,
} from "@/lib/services/ml";

export const dynamic = "force-dynamic";

function toDateStr(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const user = session.user;
  if (user?.role !== "ADMIN")
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const claims = await prisma.claim.findMany({
    select: {
      id:           true,
      orderId:      true,
      productName:  true,
      orderDate:    true,
      createdAt:    true,
      type:         true,
      aiDecision:   true,
      mlInput:      true,
      exportedToML: true,
      exportedAt:   true,
      vendor:       { select: { companyName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = claims.map((c) => {
    const hasMlInput =
      !!c.mlInput && typeof c.mlInput === "object" && !Array.isArray(c.mlInput);

    // Sans mlInput persisté, la claim est ignorée par l'export : on n'affiche
    // que ce qu'elle connaît réellement plutôt que les valeurs par défaut du
    // builder, qui se liraient à tort comme de vraies données.
    const row = hasMlInput
      ? buildReclamationInputFromClaim({
          orderId:     c.orderId,
          productName: c.productName,
          orderDate:   c.orderDate,
          createdAt:   c.createdAt,
          type:        c.type,
          aiDecision:  c.aiDecision,
          vendor:      c.vendor,
          mlInput:     c.mlInput as Record<string, unknown>,
        })
      : {
          Order_ID:     c.orderId,
          Product_Name: c.productName,
          Shop_Name:    c.vendor.companyName,
          Order_Date:   toDateStr(c.orderDate),
          Return_Date:  toDateStr(c.createdAt),
          Resolution:
            c.aiDecision ?? (c.type ? TYPE_TO_RESOLUTION[c.type] : null),
        };

    return {
      id:           c.id,
      exportedToML: c.exportedToML,
      exportedAt:   c.exportedAt,
      hasMlInput,
      row,
    };
  });

  return NextResponse.json({ claims: rows });
}
