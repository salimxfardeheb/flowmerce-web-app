import { prisma } from './prisma'

export async function checkRateLimit(
  key: string,
  maxAttempts = 3,
  windowMs = 60 * 60 * 1000,
): Promise<boolean> {
  const now     = new Date()
  const resetAt = new Date(now.getTime() + windowMs)

  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.returnRateLimit.findUnique({ where: { key } })
        if (!existing) {
          await tx.returnRateLimit.create({ data: { key, count: 1, resetAt } })
          return true
        }
        if (existing.resetAt < now) {
          await tx.returnRateLimit.update({ where: { key }, data: { count: 1, resetAt } })
          return true
        }
        if (existing.count >= maxAttempts) return false
        await tx.returnRateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
        return true
      },
      { isolationLevel: 'Serializable' }
    )
  } catch {
    return false
  }
}
