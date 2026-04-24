import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashApiKey } from "@/lib/utils"
import crypto from "crypto"

export async function POST(req: NextRequest) {
  const apiKeyValue = req.headers.get("x-api-key")
  if (!apiKeyValue) {
    return NextResponse.json({ error: "Clé API manquante" }, { status: 401 })
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: hashApiKey(apiKeyValue) },
    include: { vendor: true },
  }).catch(() => null)

  if (!apiKey || !apiKey.isActive) {
    return NextResponse.json({ error: "Clé API invalide ou révoquée" }, { status: 401 })
  }
  if (apiKey.vendor.status !== "APPROVED") {
    return NextResponse.json({ error: "Compte vendeur non approuvé" }, { status: 403 })
  }

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
      vendorId:      apiKey.id,
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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    ?? `${req.headers.get("x-forwarded-proto") ?? "http"}://${req.headers.get("host")}`
  return NextResponse.json({ url: `${baseUrl}/return/${token}` })
}
