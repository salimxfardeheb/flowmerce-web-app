// app/api/return/[token]/route.ts — Flowmerce
//
// @deprecated — utiliser le canal unique `POST /api/v1/returns` avec l'en-tête
// `X-Return-Token: <ret_…>`. Cette route ne subsiste que pour les intégrations
// qui pilotent elles-mêmes un jeton de session obtenu via
// POST /api/return-sessions ; elle délègue intégralement au même service et n'a
// donc aucun comportement propre.
//
// À supprimer une fois confirmé qu'aucun appelant externe ne l'utilise plus.

import { NextRequest, NextResponse } from 'next/server'
import { resolveSubmissionContext }  from '@/lib/services/return-credentials'
import { submitReturn, clientIp }    from '@/lib/services/return-submission'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const resolved = await resolveSubmissionContext(req, { sessionToken: token })
  if (!resolved.ok) return resolved.response

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 }) }

  return submitReturn({ ctx: resolved.ctx, body, ip: clientIp(req) })
}
