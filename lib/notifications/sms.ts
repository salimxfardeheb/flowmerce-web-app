import twilio from 'twilio'
import { env, hasTwilio } from '@/lib/env'

const DECISION_LABELS: Record<string, string> = {
  Refund:   'Remboursement approuvé',
  Exchange: 'Échange approuvé',
  Repair:   'Réparation approuvée',
  Reject:   'Réclamation refusée',
}

interface SendDecisionSmsParams {
  to: string
  customerName: string
  orderId: string
  vendorName: string
  decision: string
  motif?: string
}

function createClient() {
  return twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
}

export async function sendDecisionSms(params: SendDecisionSmsParams) {
  const { to, customerName, orderId, vendorName, decision, motif } = params

  if (!hasTwilio()) {
    console.warn('[SMS] Variables Twilio manquantes — envoi ignoré')
    return { ok: false, error: 'missing_config' }
  }

  let digits = to.replace(/\D/g, '')
  if (!digits || digits.length < 8) {
    console.warn('[SMS] Numéro invalide :', to)
    return { ok: false, error: 'invalid_number' }
  }
  if (digits.startsWith('0')) {
    digits = env.TWILIO_DEFAULT_COUNTRY_CODE + digits.slice(1)
  }
  const normalizedTo = `+${digits}`

  const decisionLine = DECISION_LABELS[decision] ?? decision

  const body = [
    `Bonjour ${customerName},`,
    `Votre réclamation pour la commande #${orderId.slice(-10).toUpperCase()} chez ${vendorName} a été traitée.`,
    `Décision : ${decisionLine}.`,
    motif ? `Motif : ${motif}` : null,
    `Vous serez contacté(e) prochainement.`,
    `— FLOWMERCE`,
  ].filter(Boolean).join('\n')

  try {
    const client = createClient()
    const message = await client.messages.create({
      body,
      from: env.TWILIO_FROM_NUMBER!,
      to:   normalizedTo,
    })
    console.log(`[SMS] Envoyé à ${normalizedTo} — SID: ${message.sid}`)
    return { ok: true, sid: message.sid }
  } catch (err) {
    console.error('[SMS] Erreur envoi:', err)
    return { ok: false, error: err }
  }
}
