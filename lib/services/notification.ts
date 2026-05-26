// lib/services/notification.ts — Flowmerce
//
// Notification client lors d'une décision sur une réclamation.
// Icônes SVG Lucide inline · Logo sans fond noir · Adresse no-reply
//
// Variables d'environnement :
//   GMAIL_USER         = votre.adresse@gmail.com
//   GMAIL_APP_PASSWORD = mot de passe d'application Gmail (16 caractères)
//
// Prérequis : public/logo-mark.png dans votre projet Next.js

import nodemailer from 'nodemailer'
import path       from 'path'
import fs         from 'fs'
import { env }    from '@/lib/env'
import { log }    from '@/lib/logger'
import type { AIDecision } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

type NotificationStatus = 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'

export interface NotificationPayload {
  customerName:  string
  customerEmail: string
  customerPhone?: string | null
  orderId:        string
  status:         NotificationStatus
  aiDecision?:    AIDecision | null
  claimType?:     string | null
  note?:          string | null
}

// ── Icônes PNG inline via CID (compatibles Gmail/Outlook/Apple Mail) ──────────
// Les SVG inline sont strippés par la plupart des clients mail — on passe par
// des PNG attachés en CID, comme le logo.

type IconKey = 'refund' | 'exchange' | 'repair' | 'reject' | 'clock' | 'note'

const ICON_CID: Record<IconKey, string> = {
  refund:   'flowmerce-icon-refund',
  exchange: 'flowmerce-icon-exchange',
  repair:   'flowmerce-icon-repair',
  reject:   'flowmerce-icon-reject',
  clock:    'flowmerce-icon-clock',
  note:     'flowmerce-icon-note',
}

function iconImg(name: IconKey, size = 28): string {
  return `<img src="cid:${ICON_CID[name]}" alt="" width="${size}" height="${size}" style="display:inline-block;border:0;vertical-align:middle;" />`
}

// ── Config décision ML ────────────────────────────────────────────────────────

const DECISION_CONFIG: Record<string, {
  label:    string
  iconKey:  'refund' | 'exchange' | 'repair' | 'reject' | 'clock'
  accent:   string
  bg:       string
  bodyText: string
}> = {
  Refund: {
    label:    'Remboursement accordé',
    iconKey:  'refund',
    accent:   '#16a34a',
    bg:       '#f0fdf4',
    bodyText: 'Votre demande de retour a été examinée et un <strong style="color:#16a34a">remboursement</strong> a été accordé. Vous recevrez votre remboursement selon le mode de paiement initial dans les prochains jours ouvrés.',
  },
  Exchange: {
    label:    'Échange accordé',
    iconKey:  'exchange',
    accent:   '#2563eb',
    bg:       '#eff6ff',
    bodyText: 'Votre demande de retour a été examinée et un <strong style="color:#2563eb">échange de produit</strong> a été accordé. Notre équipe vous contactera pour organiser le renvoi et la livraison du nouveau produit.',
  },
  Repair: {
    label:    'Réparation accordée',
    iconKey:  'repair',
    accent:   '#d97706',
    bg:       '#fffbeb',
    bodyText: 'Votre demande a été examinée et une <strong style="color:#d97706">réparation</strong> a été accordée. Vous recevrez prochainement les instructions pour nous faire parvenir le produit défectueux.',
  },
  Reject: {
    label:    'Demande non retenue',
    iconKey:  'reject',
    accent:   '#dc2626',
    bg:       '#fef2f2',
    bodyText: "Après examen de votre dossier, votre demande de retour n'a malheureusement pas pu être acceptée. Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à contacter notre support.",
  },
  IN_PROGRESS: {
    label:    'En cours de traitement',
    iconKey:  'clock',
    accent:   '#6366f1',
    bg:       '#eef2ff',
    bodyText: "Votre demande est en cours de traitement par notre équipe. Nous vous tiendrons informé de l'avancement dès que possible.",
  },
}

// ── Builder HTML ──────────────────────────────────────────────────────────────

function buildEmailHtml(p: NotificationPayload): string {
  const key = p.aiDecision ?? p.status
  const cfg = DECISION_CONFIG[key] ?? DECISION_CONFIG['IN_PROGRESS']

  // Icône PNG dans un cercle coloré (CID inline — compatible Gmail/Outlook)
  const decisionIcon = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
      <tr><td style="background:${cfg.accent}18;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;">
        ${iconImg(cfg.iconKey, 28)}
      </td></tr>
    </table>`

  const noteBlock = p.note?.trim()
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
         <tr>
           <td style="width:20px;vertical-align:top;padding-top:2px;">${iconImg('note', 15)}</td>
           <td style="padding-left:8px;background:#f8fafc;border-left:3px solid ${cfg.accent};border-radius:0 8px 8px 0;padding:12px 14px 12px 14px;">
             <p style="margin:0;font-size:13px;color:#475569;font-style:italic;">${p.note}</p>
           </td>
         </tr>
       </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Décision sur votre retour</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- ── Logo header ─────────────────────────────────────────── -->
  <!-- Le logo PNG contient déjà son fond dégradé bleu.          -->
  <!-- On l'affiche directement sans div wrapper (pas de fond    -->
  <!-- supplémentaire = pas de fond noir parasite).              -->
  <tr><td style="padding:0 0 24px;text-align:center;">
    <img src="cid:flowmerce-logo"
         alt="Flowmerce" width="56" height="56"
         style="display:inline-block;border-radius:14px;border:0;" />
    <p style="margin:8px 0 0;font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Flowmerce</p>
  </td></tr>

  <!-- ── Card principale ── -->
  <tr><td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;">

    <!-- Bande top -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:4px;background:linear-gradient(90deg,#3b82f6,#06b6d4);font-size:0;">&nbsp;</td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:36px 40px 32px;">

        <!-- Titre -->
        <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600;">
          Décision sur votre réclamation
        </p>
        <p style="margin:0 0 28px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
          Commande #${p.orderId}
        </p>

        <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
          Bonjour <strong style="color:#0f172a;">${p.customerName}</strong>,
        </p>

        <!-- Badge décision avec icône SVG Lucide -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:${cfg.bg};border:1.5px solid ${cfg.accent}28;border-radius:12px;margin:0 0 24px;">
          <tr><td style="padding:24px;text-align:center;">
            ${decisionIcon}
            <p style="margin:0 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600;">Décision</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:${cfg.accent};">${cfg.label}</p>
          </td></tr>
        </table>

        <!-- Corps texte -->
        <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.75;">
          ${cfg.bodyText}
        </p>

        ${noteBlock}

        <!-- Récap commande -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px;font-size:13px;">
          <tr style="background:#f8fafc;">
            <td style="padding:11px 16px;color:#94a3b8;font-weight:500;border-bottom:1px solid #e2e8f0;width:40%;">Commande</td>
            <td style="padding:11px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">#${p.orderId}</td>
          </tr>
          ${p.aiDecision ? `<tr>
            <td style="padding:11px 16px;color:#94a3b8;font-weight:500;">Décision</td>
            <td style="padding:11px 16px;font-weight:700;color:${cfg.accent};">${cfg.label}</td>
          </tr>` : ''}
        </table>

      </td></tr>

      <!-- Pied de page -->
      <tr><td style="padding:16px 40px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">
          Propulsé par <strong style="color:#64748b;">Flowmerce</strong>
          &nbsp;·&nbsp; Gestion intelligente des retours
        </p>
        <p style="margin:0;font-size:11px;color:#cbd5e1;">
          Ceci est un e-mail automatique — merci de ne pas répondre à cette adresse.
        </p>
      </td></tr>

    </table>
  </td></tr>

</table>
</td></tr>
</table>

</body>
</html>`
}

// ── Envoi email ───────────────────────────────────────────────────────────────

async function sendEmail(p: NotificationPayload): Promise<boolean> {
  const user = env.GMAIL_USER
  const pass = env.GMAIL_APP_PASSWORD

  const cfg     = DECISION_CONFIG[p.aiDecision ?? p.status] ?? DECISION_CONFIG['IN_PROGRESS']
  const subject = p.aiDecision
    ? `${cfg.label} — Commande #${p.orderId}`
    : `Mise à jour de votre retour — Commande #${p.orderId}`

  const logoPath   = path.join(process.cwd(), 'public', 'logo-mark.png')
  const logoExists = fs.existsSync(logoPath)

  if (!logoExists) {
    log.warn('notification.logo_missing', { path: 'public/logo-mark.png' })
  }

  // Icônes décision en PNG attachées via CID (les SVG inline sont strippés
  // par Gmail/Outlook). On joint uniquement celles présentes sur disque.
  const iconsDir = path.join(process.cwd(), 'public', 'email-icons')
  const iconAttachments = (Object.entries(ICON_CID) as [IconKey, string][])
    .map(([key, cid]) => ({
      filename:           `${key}.png`,
      path:               path.join(iconsDir, `${key}.png`),
      cid,
      contentDisposition: 'inline' as const,
    }))
    .filter(a => fs.existsSync(a.path))

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })

    await transporter.sendMail({
      from:    `"Flowmerce" <${user}>`,   // Nom affiché dans la boîte mail
      replyTo: `no-reply <${user}>`,      // Indique visuellement no-reply
      to:      p.customerEmail,
      subject,
      html:    buildEmailHtml(p),
      // Logo + icônes décision en pièces jointes inline CID (seule méthode
      // acceptée par Gmail pour l'affichage d'images embarquées).
      attachments: [
        ...(logoExists ? [{
          filename:           'logo-mark.png',
          path:               logoPath,
          cid:                'flowmerce-logo',
          contentDisposition: 'inline' as const,
        }] : []),
        ...iconAttachments,
      ],
    })

    log.info('notification.email_sent', {
      decision: cfg.label, to: p.customerEmail, orderId: p.orderId,
    })
    return true
  } catch (err) {
    log.error('notification.email_error', { err: String(err) })
    return false
  }
}

// ── Entrée publique ───────────────────────────────────────────────────────────

export async function notifyCustomer(payload: NotificationPayload): Promise<void> {
  await sendEmail(payload)
}