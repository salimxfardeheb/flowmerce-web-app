import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('logger', () => {
  it('exporte un objet log avec les méthodes requises', async () => {
    const { log } = await import('@/lib/logger')
    expect(log).toBeDefined()
    expect(typeof log.debug).toBe('function')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.child).toBe('function')
  })

  it('child() crée un logger avec un contexte de base', async () => {
    const { log } = await import('@/lib/logger')
    const child = log.child({ source: 'test' })
    expect(child).toBeDefined()
    expect(typeof child.info).toBe('function')
  })

  it('log en mode debug si LOG_LEVEL=debug', async () => {
    process.env.LOG_LEVEL = 'debug'
    process.env.NODE_ENV = 'test'
    const { log } = await import('@/lib/logger')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.debug('test msg', { key: 'val' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('n\'émet pas de debug si LOG_LEVEL=info', async () => {
    process.env.LOG_LEVEL = 'info'
    process.env.NODE_ENV = 'test'
    const { log } = await import('@/lib/logger')
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log.debug('should not appear')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('utilise console.error pour les logs error', async () => {
    process.env.LOG_LEVEL = 'debug'
    const { log } = await import('@/lib/logger')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.error('error msg')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('utilise console.warn pour les logs warn', async () => {
    process.env.LOG_LEVEL = 'debug'
    const { log } = await import('@/lib/logger')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log.warn('warn msg')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
