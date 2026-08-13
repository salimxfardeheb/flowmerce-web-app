// app/api/contact/route.ts
//
// Formulaire de contact public.
//
// Destination : GMAIL_USER, via le même transport nodemailer que les
// notifications client. Le `replyTo` porte l'adresse du visiteur pour
// qu'une réponse parte directement vers lui depuis la boîte Gmail.
//
// Rien n'est persisté : pas de modèle ContactMessage, donc pas de migration.
// Si un jour l'historique des demandes est nécessaire, c'est ici qu'il faudra
// ajouter l'écriture en base avant l'envoi.
//
// Protections :
//   1. Champ piège `website` : rempli = bot, on répond 200 sans envoyer,
//      pour ne pas renseigner le robot sur le filtrage.
//   2. Limite de débit par IP (3 messages par heure) via le même compteur
//      que le formulaire de retour public.
//
// L'ordre compte : la limite est vérifiée APRÈS la validation et le piège.
// Placée avant, trois fautes de frappe suffisaient à bloquer un visiteur
// légitime pendant une heure sans qu'aucun message ne soit parti. Seuls les
// messages réellement envoyables consomment le quota, ce qui protège la
// ressource coûteuse (l'envoi) sans punir l'erreur de saisie.

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { checkRateLimit } from '@/lib/rate-limit'
import { env } from '@/lib/env'
import { log } from '@/lib/logger'

const ContactSchema = z.object({
  name:    z.string().trim().min(2, 'Nom trop court').max(120),
  email:   z.string().trim().email('Adresse email invalide').max(200),
  shop:    z.string().trim().max(200).optional().or(z.literal('')),
  message: z.string().trim().min(20, 'Message trop court').max(4000),
  website: z.string().optional(), // piège à bots, doit rester vide
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide' },
      { status: 422 },
    )
  }

  const { name, email, shop, message, website } = parsed.data

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // Bot détecté : on simule le succès sans rien envoyer.
  if (website && website.trim() !== '') {
    log.warn('contact.honeypot', { ip })
    return NextResponse.json({ ok: true })
  }

  const allowed = await checkRateLimit(`contact:${ip}`, 3, 60 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Trop de messages envoyés. Réessayez dans une heure.' },
      { status: 429 },
    )
  }

  const user = env.GMAIL_USER
  const pass = env.GMAIL_APP_PASSWORD

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })

    await transporter.sendMail({
      from:    `"Flowmerce contact" <${user}>`,
      to:      user,
      replyTo: `"${name}" <${email}>`,
      subject: `Contact site : ${name}${shop ? ` (${shop})` : ''}`,
      text: [
        `Nom     : ${name}`,
        `Email   : ${email}`,
        `Boutique: ${shop || 'non renseignée'}`,
        '',
        message,
      ].join('\n'),
      html: `
        <p><strong>Nom</strong> : ${escapeHtml(name)}<br>
        <strong>Email</strong> : ${escapeHtml(email)}<br>
        <strong>Boutique</strong> : ${escapeHtml(shop || 'non renseignée')}</p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
      `,
    })

    log.info('contact.sent', { email, shop: shop || null })
    return NextResponse.json({ ok: true })
  } catch (err) {
    log.error('contact.email_error', { err: String(err) })
    return NextResponse.json(
      { error: 'Envoi impossible pour le moment. Réessayez dans quelques minutes.' },
      { status: 502 },
    )
  }
}
