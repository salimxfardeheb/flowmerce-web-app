import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type EnvModule = typeof import('@/lib/env')

function validEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'https://db.example.com',
    DIRECT_URL: 'https://direct.example.com',
    NEXTAUTH_SECRET: 'a'.repeat(32),
    AUTH_SECRET: 'b'.repeat(32),
    SUPABASE_URL: 'https://supabase.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'some-key',
    CRON_SECRET: 'c'.repeat(32),
    ML_API_URL: 'https://ml.example.com/predict',
    ML_INTERNAL_SECRET: '12345678',
    GMAIL_USER: 'test@gmail.com',
    GMAIL_APP_PASSWORD: 'd'.repeat(16),
    NEXT_PUBLIC_BASE_URL: 'https://app.example.com',
  }
}

function setEnv(vars: Record<string, string>) {
  Object.entries(vars).forEach(([k, v]) => {
    process.env[k] = v
  })
}

function clearEnv(vars: Record<string, string>) {
  Object.keys(vars).forEach((k) => {
    delete process.env[k]
  })
}

describe('env', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    clearEnv(validEnv())
  })

  it('valide des variables d\'environnement correctes', async () => {
    setEnv(validEnv())
    const mod: EnvModule = await import('@/lib/env')
    expect(mod.env.DATABASE_URL).toBe('https://db.example.com')
    expect(mod.env.NODE_ENV).toBe('test')
    expect(mod.env.NEXT_PUBLIC_BASE_URL).toBe('https://app.example.com')
  })

  it('utilise development comme NODE_ENV par défaut', async () => {
    const vars = validEnv()
    delete vars.NODE_ENV
    setEnv(vars)
    const mod: EnvModule = await import('@/lib/env')
    expect(mod.env.NODE_ENV).toBe('development')
  })

  describe('validation DATABASE_URL', () => {
    it('rejette une DATABASE_URL manquante', async () => {
      const vars = validEnv()
      delete vars.DATABASE_URL
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow()
    })

    it('rejette une DATABASE_URL invalide', async () => {
      const vars = validEnv()
      vars.DATABASE_URL = 'pas-une-url'
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow()
    })
  })

  describe('validation NEXTAUTH_SECRET', () => {
    it('rejette un secret trop court', async () => {
      const vars = validEnv()
      vars.NEXTAUTH_SECRET = 'too-short'
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow(
        /NEXTAUTH_SECRET must be at least 32 characters/,
      )
    })
  })

  describe('validation GMAIL', () => {
    it('rejette un email invalide', async () => {
      const vars = validEnv()
      vars.GMAIL_USER = 'pas-un-email'
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow()
    })

    it('rejette un mot de passe trop court', async () => {
      const vars = validEnv()
      vars.GMAIL_APP_PASSWORD = 'short'
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow(
        /GMAIL_APP_PASSWORD must be at least 16 characters/,
      )
    })
  })

  describe('validation ML_API_URL', () => {
    it('rejette une URL invalide', async () => {
      const vars = validEnv()
      vars.ML_API_URL = 'not-a-url'
      setEnv(vars)
      await expect(import('@/lib/env')).rejects.toThrow()
    })
  })
})

describe('env - client-side guard', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    clearEnv(validEnv())
    vi.unstubAllGlobals()
  })

  it('interdit l\'accès à une variable serveur depuis le client', async () => {
    vi.stubGlobal('window', {})
    setEnv(validEnv())
    const mod: EnvModule = await import('@/lib/env')
    expect(() => mod.env.DATABASE_URL).toThrow(
      /Server-only variable "DATABASE_URL"/,
    )
  })

  it('autorise l\'accès à NEXT_PUBLIC_ depuis le client', async () => {
    vi.stubGlobal('window', {})
    setEnv(validEnv())
    const mod: EnvModule = await import('@/lib/env')
    expect(mod.env.NEXT_PUBLIC_BASE_URL).toBe('https://app.example.com')
  })
})
