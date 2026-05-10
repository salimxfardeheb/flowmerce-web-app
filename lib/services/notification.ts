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

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimStatus = 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
export type AIDecision  = 'Refund' | 'Exchange' | 'Repair' | 'Reject' | null | undefined

export interface NotificationPayload {
  customerName:  string
  customerEmail: string
  customerPhone?: string | null
  orderId:        string
  status:         ClaimStatus
  aiDecision?:    AIDecision
  claimType?:     string | null
  note?:          string | null
}

// ── Icônes SVG Lucide (inline — compatibles Gmail/Outlook/Apple Mail) ─────────

function icon(name: 'refund' | 'exchange' | 'repair' | 'reject' | 'clock' | 'note', color: string, size = 28): string {
  const s = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"`
  const paths: Record<string, string> = {
    // Wallet — remboursement
    refund:   `<svg ${s}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
    // ArrowLeftRight — échange
    exchange: `<svg ${s}><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>`,
    // Wrench — réparation
    repair:   `<svg ${s}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    // XCircle — refus
    reject:   `<svg ${s}><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    // Clock — en cours
    clock:    `<svg ${s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    // FileText — note
    note:     `<svg ${s}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  }
  return paths[name] ?? ''
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

  // Icône SVG dans un cercle coloré (même taille que le badge décision)
  const decisionIcon = `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
      <tr><td style="background:${cfg.accent}18;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;">
        ${icon(cfg.iconKey, cfg.accent, 26)}
      </td></tr>
    </table>`

  const noteBlock = p.note?.trim()
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
         <tr>
           <td style="width:20px;vertical-align:top;padding-top:2px;">${icon('note', '#64748b', 15)}</td>
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
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD

  if (!user || !pass) {
    console.warn('[Notification/Email] Non configuré — GMAIL_USER ou GMAIL_APP_PASSWORD manquant')
    return false
  }

  const cfg     = DECISION_CONFIG[p.aiDecision ?? p.status] ?? DECISION_CONFIG['IN_PROGRESS']
  const subject = p.aiDecision
    ? `${cfg.label} — Commande #${p.orderId}`
    : `Mise à jour de votre retour — Commande #${p.orderId}`

  const logoPath   = path.join(process.cwd(), 'public', 'logo-mark.png')
  const logoExists = fs.existsSync(logoPath)

  if (!logoExists) {
    console.warn('[Notification/Email] Logo introuvable : public/logo-mark.png')
  }

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
      // Logo en pièce jointe inline CID — seule méthode acceptée par Gmail
      attachments: logoExists ? [{
        filename:           'logo-mark.png',
        path:               logoPath,
        cid:                'flowmerce-logo',
        contentDisposition: 'inline',
      }] : [],
    })

    console.log(`[Notification/Email] ✔ ${cfg.label} → ${p.customerEmail} (commande #${p.orderId})`)
    return true
  } catch (err) {
    console.error('[Notification/Email] ✗ Erreur :', err)
    return false
  }
}

// ── Entrée publique ───────────────────────────────────────────────────────────

export async function notifyCustomer(payload: NotificationPayload): Promise<void> {
  await sendEmail(payload)
}