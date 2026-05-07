export { sendDecisionSms }   from './sms'
export { sendDecisionEmail } from './email'

import { sendDecisionSms }   from './sms'
import { sendDecisionEmail } from './email'

interface NotifyClientParams {
  customerName:  string
  customerEmail: string
  customerPhone?: string | null
  orderId:       string
  vendorName:    string
  decision:      string
  motif?:        string
  claimId:       string
}

export async function notifyClient(params: NotifyClientParams) {
  const results = { sms: null as unknown, email: null as unknown }

  results.email = await sendDecisionEmail({
    to:           params.customerEmail,
    customerName: params.customerName,
    orderId:      params.orderId,
    vendorName:   params.vendorName,
    decision:     params.decision,
    motif:        params.motif,
    claimId:      params.claimId,
  })

  if (params.customerPhone) {
    results.sms = await sendDecisionSms({
      to:           params.customerPhone,
      customerName: params.customerName,
      orderId:      params.orderId,
      vendorName:   params.vendorName,
      decision:     params.decision,
      motif:        params.motif,
    })
  }

  return results
}
