import nodemailer from 'nodemailer'

interface DecisionStyle {
  label:   string
  color:   string
  bgColor: string
  dotColor: string
}

const DECISION_STYLES: Record<string, DecisionStyle> = {
  Refund:   { label: 'Remboursement approuvé', color: '#059669', bgColor: '#ECFDF5', dotColor: '#10B981' },
  Exchange: { label: 'Échange approuvé',        color: '#2563EB', bgColor: '#EFF6FF', dotColor: '#3B82F6' },
  Repair:   { label: 'Réparation approuvée',    color: '#D97706', bgColor: '#FFFBEB', dotColor: '#F59E0B' },
  Reject:   { label: 'Réclamation refusée',     color: '#DC2626', bgColor: '#FEF2F2', dotColor: '#EF4444' },
}

interface SendDecisionEmailParams {
  to: string
  customerName: string
  orderId: string
  vendorName: string
  decision: string
  motif?: string
  claimId: string
}

function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

function buildHtml(params: SendDecisionEmailParams): string {
  const { customerName, orderId, vendorName, decision, motif, claimId } = params

  const d = DECISION_STYLES[decision] ?? {
    label:    decision,
    color:    '#6B7280',
    bgColor:  '#F3F4F6',
    dotColor: '#9CA3AF',
  }

  const shortClaim = `#${claimId.slice(-10).toUpperCase()}`
  const shortOrder = orderId.slice(-10).toUpperCase()

  const motifRow = motif
    ? `
      <tr>
        <td style="padding: 0 0 16px 0;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background-color: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px;">
            <tr>
              <td style="padding: 14px 16px;">
                <p style="margin: 0 0 4px 0; font-family: Arial, sans-serif; font-size: 11px;
                           font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
                           color: #6B7280;">Motif</p>
                <p style="margin: 0; font-family: Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.5;">${motif}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flowmerce — Décision sur votre réclamation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F9FAFB; font-family: Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #F9FAFB; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 16px;">

        <!-- Container -->
        <table cellpadding="0" cellspacing="0" border="0" width="560"
               style="max-width: 560px; width: 100%; background-color: #FFFFFF;
                      border-radius: 12px; overflow: hidden;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);">

          <!-- Header -->
          <tr>
            <td style="background-color: #4F46E5; padding: 28px 32px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <!-- Diamond logo -->
                    <table cellpadding="0" cellspacing="0" border="0"
                           style="width: 36px; height: 36px; background-color: rgba(255,255,255,0.15);
                                  border-radius: 8px;">
                      <tr>
                        <td align="center" style="padding: 6px;">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                               xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L22 9L12 22L2 9L12 2Z" fill="white" fill-opacity="0.9"/>
                            <path d="M12 2L22 9L12 14L2 9L12 2Z" fill="white"/>
                          </svg>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-family: Arial, sans-serif; font-size: 20px; font-weight: 700;
                                 color: #FFFFFF; letter-spacing: -0.02em;">FLOWMERCE</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 32px 0 32px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">

                <!-- Greeting -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <h1 style="margin: 0 0 8px 0; font-family: Arial, sans-serif; font-size: 22px;
                                font-weight: 700; color: #111827; line-height: 1.3;">
                      Bonjour ${customerName},
                    </h1>
                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 15px;
                               color: #6B7280; line-height: 1.6;">
                      Votre réclamation chez <strong style="color: #374151;">${vendorName}</strong>
                      a été examinée et une décision a été rendue.
                    </p>
                  </td>
                </tr>

                <!-- Order info -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <table cellpadding="0" cellspacing="0" border="0" width="100%"
                           style="border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden;">
                      <tr style="background-color: #F9FAFB;">
                        <td style="padding: 10px 16px; border-bottom: 1px solid #E5E7EB;">
                          <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td>
                                <span style="font-family: Arial, sans-serif; font-size: 11px;
                                             font-weight: 600; text-transform: uppercase;
                                             letter-spacing: 0.05em; color: #9CA3AF;">Commande</span>
                              </td>
                              <td align="right">
                                <span style="font-family: 'Courier New', Courier, monospace;
                                             font-size: 13px; font-weight: 700; color: #111827;">
                                  #${shortOrder}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td>
                                <span style="font-family: Arial, sans-serif; font-size: 11px;
                                             font-weight: 600; text-transform: uppercase;
                                             letter-spacing: 0.05em; color: #9CA3AF;">Vendeur</span>
                              </td>
                              <td align="right">
                                <span style="font-family: Arial, sans-serif; font-size: 13px;
                                             font-weight: 600; color: #374151;">${vendorName}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Decision badge -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 10px 0; font-family: Arial, sans-serif; font-size: 13px;
                               font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
                               color: #9CA3AF;">Décision</p>
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: ${d.bgColor}; border-radius: 999px;
                                   padding: 8px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="vertical-align: middle; padding-right: 8px;">
                                <div style="width: 8px; height: 8px; background-color: ${d.dotColor};
                                            border-radius: 50%; display: inline-block;"></div>
                              </td>
                              <td style="vertical-align: middle;">
                                <span style="font-family: Arial, sans-serif; font-size: 14px;
                                             font-weight: 600; color: ${d.color};">${d.label}</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Motif (optional) -->
                ${motifRow}

                <!-- Claim reference -->
                <tr>
                  <td style="padding-bottom: 20px;">
                    <p style="margin: 0 0 6px 0; font-family: Arial, sans-serif; font-size: 12px;
                               color: #9CA3AF;">N° de dossier</p>
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 14px;
                                 font-weight: 700; color: #4F46E5; background-color: #EEF2FF;
                                 padding: 4px 10px; border-radius: 6px; display: inline-block;">
                      ${shortClaim}
                    </span>
                  </td>
                </tr>

                <!-- Next steps -->
                <tr>
                  <td style="padding-bottom: 32px;">
                    <p style="margin: 0; font-family: Arial, sans-serif; font-size: 14px;
                               color: #6B7280; line-height: 1.6;">
                      Vous serez contacté(e) prochainement pour la suite du traitement.
                      Pour toute question, contactez directement votre vendeur.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #F9FAFB;
                       border-top: 1px solid #E5E7EB;">
              <p style="margin: 0; font-family: Arial, sans-serif; font-size: 12px;
                         color: #9CA3AF; text-align: center; line-height: 1.5;">
                © 2025 Flowmerce — Gestion intelligente des retours<br>
                <span style="font-size: 11px;">Cet email est généré automatiquement, merci de ne pas y répondre.</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendDecisionEmail(params: SendDecisionEmailParams) {
  const { to, claimId, decision } = params

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] Variables SMTP manquantes — envoi ignoré')
    return { ok: false, error: 'missing_config' }
  }

  const subject = decision === 'Reject'
    ? `Flowmerce — Réclamation #${claimId.slice(-8).toUpperCase()} refusée`
    : `Flowmerce — Réclamation #${claimId.slice(-8).toUpperCase()} traitée`

  const html = buildHtml(params)

  try {
    const transporter = createTransporter()
    await transporter.sendMail({
      from: `"Flowmerce" <${process.env.SMTP_FROM ?? 'noreply@flowmerce.com'}>`,
      to,
      subject,
      html,
    })
    console.log(`[Email] Envoyé à ${to}`)
    return { ok: true }
  } catch (err) {
    console.error('[Email] Erreur envoi:', err)
    return { ok: false, error: err }
  }
}
