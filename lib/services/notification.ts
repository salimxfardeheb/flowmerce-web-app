// lib/services/notification.ts — Flowmerce
//
// Notification client lors d'une décision sur une réclamation.
// Envoie la décision ML (Refund / Exchange / Repair / Reject) — pas le statut admin.
//
// Variables d'environnement :
//   GMAIL_USER         = votre.adresse@gmail.com
//   GMAIL_APP_PASSWORD = mot de passe d'application Gmail (16 caractères)

import nodemailer from 'nodemailer'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClaimStatus  = 'APPROVED' | 'REJECTED' | 'IN_PROGRESS'
export type AIDecision   = 'Refund' | 'Exchange' | 'Repair' | 'Reject' | null | undefined

export interface NotificationPayload {
  customerName:  string
  customerEmail: string
  customerPhone?: string | null
  orderId:        string
  status:         ClaimStatus
  aiDecision?:    AIDecision      // ← décision ML à afficher dans le mail
  claimType?:     string | null
  note?:          string | null
}

// ── Config décision ML ────────────────────────────────────────────────────────

const LOGO_B64 = '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'

const DECISION_CONFIG: Record<string, {
  label:    string
  emoji:    string
  accent:   string
  bg:       string
  bodyText: string
}> = {
  Refund: {
    label:    'Remboursement accordé',
    emoji:    '💰',
    accent:   '#16a34a',
    bg:       '#f0fdf4',
    bodyText: 'Votre demande de retour a été examinée et un <strong style="color:#16a34a">remboursement</strong> a été accordé. Vous recevrez votre remboursement selon le mode de paiement initial dans les prochains jours ouvrés.',
  },
  Exchange: {
    label:    'Échange accordé',
    emoji:    '🔄',
    accent:   '#2563eb',
    bg:       '#eff6ff',
    bodyText: 'Votre demande de retour a été examinée et un <strong style="color:#2563eb">échange de produit</strong> a été accordé. Notre équipe vous contactera pour organiser le renvoi et la livraison du nouveau produit.',
  },
  Repair: {
    label:    'Réparation accordée',
    emoji:    '🔧',
    accent:   '#d97706',
    bg:       '#fffbeb',
    bodyText: 'Votre demande a été examinée et une <strong style="color:#d97706">réparation</strong> a été accordée. Vous recevrez prochainement les instructions pour nous faire parvenir le produit défectueux.',
  },
  Reject: {
    label:    'Demande non retenue',
    emoji:    '❌',
    accent:   '#dc2626',
    bg:       '#fef2f2',
    bodyText: "Après examen de votre dossier, votre demande de retour n'a malheureusement pas pu être acceptée. Si vous pensez qu'il s'agit d'une erreur, n'hésitez pas à contacter notre support.",
  },
  // Fallback pour IN_PROGRESS (pas de décision ML)
  IN_PROGRESS: {
    label:    'En cours de traitement',
    emoji:    '🔄',
    accent:   '#6366f1',
    bg:       '#eef2ff',
    bodyText: "Votre demande est en cours de traitement par notre équipe. Nous vous tiendrons informé de l'avancement dès que possible.",
  },
}

// ── Builder HTML ──────────────────────────────────────────────────────────────

function buildEmailHtml(p: NotificationPayload): string {
  // Priorité : décision ML → sinon fallback statut
  const key    = p.aiDecision ?? p.status
  const cfg    = DECISION_CONFIG[key] ?? DECISION_CONFIG['IN_PROGRESS']

  const noteBlock = p.note?.trim()
    ? `<div style="background:#f8fafc;border-left:3px solid ${cfg.accent};border-radius:0 8px 8px 0;padding:14px 18px;margin:0 0 24px;">
         <p style="margin:0;font-size:13px;color:#475569;font-style:italic;">📝 ${p.note}</p>
       </div>`
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

  <!-- ── Logo header ── -->
  <tr><td style="padding:0 0 24px;text-align:center;">
    <img src="data:image/png;base64,${LOGO_B64}"
         alt="Flowmerce" width="48" height="48"
         style="border-radius:12px;display:inline-block;" />
    <p style="margin:10px 0 0;font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Flowmerce</p>
  </td></tr>

  <!-- ── Card principale ── -->
  <tr><td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;">

    <!-- Bande colorée top -->
    <div style="height:5px;background:linear-gradient(90deg,#3b82f6,#06b6d4);"></div>

    <table width="100%" cellpadding="0" cellspacing="0">

      <!-- Corps -->
      <tr><td style="padding:36px 40px 32px;">

        <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600;">
          Décision sur votre réclamation
        </p>
        <p style="margin:0 0 28px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
          Commande #${p.orderId}
        </p>

        <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
          Bonjour <strong style="color:#0f172a;">${p.customerName}</strong>,
        </p>

        <!-- Badge décision -->
        <div style="background:${cfg.bg};border:1.5px solid ${cfg.accent}30;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
          <p style="margin:0 0 6px;font-size:26px;">${cfg.emoji}</p>
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;font-weight:600;">Décision</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:${cfg.accent};">${cfg.label}</p>
        </div>

        <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.75;">
          ${cfg.bodyText}
        </p>

        ${noteBlock}

        <!-- Récap commande -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 28px;font-size:13px;">
          <tr style="background:#f8fafc;">
            <td style="padding:11px 16px;color:#94a3b8;font-weight:500;border-bottom:1px solid #e2e8f0;">Commande</td>
            <td style="padding:11px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">#${p.orderId}</td>
          </tr>
          ${p.aiDecision ? `<tr>
            <td style="padding:11px 16px;color:#94a3b8;font-weight:500;">Décision</td>
            <td style="padding:11px 16px;font-weight:700;color:${cfg.accent};">${cfg.label}</td>
          </tr>` : ''}
        </table>

        <p style="margin:0;font-size:12px;color:#cbd5e1;text-align:center;line-height:1.5;">
          Cet e-mail a été envoyé automatiquement — merci de ne pas y répondre directement.
        </p>

      </td></tr>

      <!-- Pied de page -->
      <tr><td style="padding:18px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">
          Propulsé par
          <img src="data:image/png;base64,${LOGO_B64}" alt="" width="14" height="14"
               style="vertical-align:middle;border-radius:3px;margin:0 3px 1px;" />
          <strong style="color:#64748b;">Flowmerce</strong>
          &nbsp;·&nbsp; Gestion intelligente des retours
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
    ? `${cfg.emoji} ${cfg.label} — Commande #${p.orderId}`
    : `Mise à jour de votre retour — Commande #${p.orderId}`

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })

    await transporter.sendMail({
      from:    `"Flowmerce" <${user}>`,
      to:      p.customerEmail,
      subject,
      html:    buildEmailHtml(p),
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