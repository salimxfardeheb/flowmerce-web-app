import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { validateApiKey } from "@/lib/api-key-auth"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const rawKey =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.headers.get("x-api-key") ??
    null

  const auth = await validateApiKey(rawKey)
  if (!auth.ok) return auth.response
  const { keyRecord } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const str = (k: string) => String(body[k] ?? "").trim()

  const orderId       = str("orderId")
  const customerEmail = str("customerEmail")
  const productName   = str("productName")
  const customerName  = str("customerName")
  const customerPhone = str("customerPhone")
  const orderDate     = str("orderDate")
  const shopName      = str("shopName")

  if (!orderId || !customerEmail || !productName) {
    return NextResponse.json(
      { error: "orderId, customerEmail et productName sont requis" },
      { status: 400 }
    )
  }

  const token     = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.returnSession.create({
    data: {
      token,
      vendorId:      keyRecord.id,
      orderId,
      customerEmail,
      productName,
      customerName,
      customerPhone,
      orderDate,
      shopName,
      expiresAt,
    },
  })

  const baseUrl = env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")
  return NextResponse.json({ url: `${baseUrl}/return/${token}` })
}
