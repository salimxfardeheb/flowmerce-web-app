import { prisma } from './prisma'

export async function checkRateLimit(orderId: string, ip: string): Promise<boolean> {
  const key     = `${ip}:${orderId}`
  const now     = new Date()
  const resetAt = new Date(now.getTime() + 60 * 60 * 1000)

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
        if (existing.count >= 3) return false
        await tx.returnRateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
        return true
      },
      { isolationLevel: 'Serializable' }
    )
  } catch {
    return false
  }
}
