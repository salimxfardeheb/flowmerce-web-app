import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'

export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'
export const revalidate = 0

type CheckStatus = 'ok' | 'error' | 'skipped'

interface CheckResult {
  status:    CheckStatus
  latencyMs: number
  error?:    string
}

interface Check {
  name:      string
  critical:  boolean
  timeoutMs: number
  deepOnly?: boolean
  run:       () => Promise<void>
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

async function runCheck(c: Check): Promise<CheckResult> {
  const start = Date.now()
  try {
    await withTimeout(c.run(), c.timeoutMs, c.name)
    return { status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return {
      status:    'error',
      latencyMs: Date.now() - start,
      error:     err instanceof Error ? err.message : String(err),
    }
  }
}

const CHECKS: Check[] = [
  {
    name:      'database',
    critical:  true,
    timeoutMs: 2_500,
    run:       async () => { await prisma.$queryRaw`SELECT 1` },
  },
  {
    name:      'ml_api',
    critical:  false,
    timeoutMs: 3_000,
    deepOnly:  true,
    run: async () => {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 2_500)
      try {
        const res = await fetch(`${env.ML_API_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
          cache:  'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      } finally {
        clearTimeout(t)
      }
    },
  },
]

function decideStatus(results: Record<string, CheckResult>): 'ok' | 'degraded' | 'error' {
  let degraded = false
  for (const c of CHECKS) {
    const r = results[c.name]
    if (!r || r.status !== 'error') continue
    if (c.critical) return 'error'
    degraded = true
  }
  return degraded ? 'degraded' : 'ok'
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1'

  const toRun = CHECKS.filter((c) => deep || !c.deepOnly)

  const entries = await Promise.all(
    toRun.map(async (c) => [c.name, await runCheck(c)] as const),
  )
  const results: Record<string, CheckResult> = Object.fromEntries(entries)

  for (const c of CHECKS) {
    if (!results[c.name]) results[c.name] = { status: 'skipped', latencyMs: 0 }
  }

  const status   = decideStatus(results)
  const httpCode = status === 'error' ? 503 : 200

  return NextResponse.json(
    {
      status,
      timestamp:     new Date().toISOString(),
      uptime:        process.uptime(),
      environment:   env.NODE_ENV,
      database:      results.database.status === 'ok' ? 'connected' : 'disconnected',
      checks:        results,
    },
    {
      status:  httpCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  )
}

export async function HEAD() {
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`.then(() => undefined),
      2_500,
      'database',
    )
    return new Response(null, {
      status:  200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return new Response(null, {
      status:  503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
