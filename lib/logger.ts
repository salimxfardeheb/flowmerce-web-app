type Level = 'debug' | 'info' | 'warn' | 'error'

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function resolveMinLevel(): Level {
  const v = (process.env.LOG_LEVEL ?? '').toLowerCase()
  return (v === 'debug' || v === 'info' || v === 'warn' || v === 'error') ? v : 'info'
}

const MIN_LEVEL = resolveMinLevel()
const PRETTY    = process.env.NODE_ENV !== 'production'

type Context = Record<string, unknown>

function emit(level: Level, msg: string, ctx?: Context): void {
  if (RANK[level] < RANK[MIN_LEVEL]) return
  const ts = new Date().toISOString()
  const line = PRETTY
    ? `[${ts}] ${level.toUpperCase().padEnd(5)} ${msg}${ctx ? ' ' + safeStringify(ctx) : ''}`
    : safeStringify({ ts, level, msg, ...ctx })
  const out = level === 'error' ? console.error
            : level === 'warn'  ? console.warn
            :                     console.log
  out(line)
}

function safeStringify(o: unknown): string {
  try { return JSON.stringify(o) } catch { return String(o) }
}

export interface Logger {
  debug: (msg: string, ctx?: Context) => void
  info:  (msg: string, ctx?: Context) => void
  warn:  (msg: string, ctx?: Context) => void
  error: (msg: string, ctx?: Context) => void
  child: (base: Context) => Logger
}

function build(base?: Context): Logger {
  const merge = (ctx?: Context) => (base ? { ...base, ...ctx } : ctx)
  return {
    debug: (m, c) => emit('debug', m, merge(c)),
    info:  (m, c) => emit('info',  m, merge(c)),
    warn:  (m, c) => emit('warn',  m, merge(c)),
    error: (m, c) => emit('error', m, merge(c)),
    child: (b)   => build({ ...(base ?? {}), ...b }),
  }
}

export const log: Logger = build()
