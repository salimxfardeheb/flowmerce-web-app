import { z } from 'zod'

const ServerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),

  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  AUTH_SECRET:     z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL:    z.string().url().optional(),

  ML_API_URL:         z.string().url(),
  ML_INTERNAL_SECRET: z.string().min(8, 'ML_INTERNAL_SECRET must be at least 8 characters'),

  GMAIL_USER:         z.string().email(),
  GMAIL_APP_PASSWORD: z.string().min(16, 'GMAIL_APP_PASSWORD must be at least 16 characters'),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY:    z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
})

const ClientSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url(),
})

type ServerEnv = z.infer<typeof ServerSchema>
type ClientEnv = z.infer<typeof ClientSchema>
export type Env  = ServerEnv & ClientEnv

const isServer = typeof window === 'undefined'

function formatIssues(err: z.ZodError): string {
  return err.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n')
}

const rawClient = {
  NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
}
const clientParsed = ClientSchema.safeParse(rawClient)
if (!clientParsed.success) {
  throw new Error(
    `[env] Invalid public environment variables:\n${formatIssues(clientParsed.error)}`,
  )
}

let serverData: ServerEnv | null = null
if (isServer) {
  const r = ServerSchema.safeParse(process.env)
  if (!r.success) {
    throw new Error(
      `[env] Invalid server environment variables — refusing to boot:\n${formatIssues(r.error)}`,
    )
  }
  serverData = r.data
}

const merged = { ...(serverData ?? {}), ...clientParsed.data } as Env

export const env = new Proxy(merged, {
  get(target, prop: string) {
    if (!isServer && !prop.startsWith('NEXT_PUBLIC_')) {
      throw new Error(
        `[env] Server-only variable "${prop}" cannot be accessed from the client bundle.`,
      )
    }
    return target[prop as keyof Env]
  },
}) as Env

