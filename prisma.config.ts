import { defineConfig } from 'prisma/config'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  datasourceUrl: process.env.DATABASE_URL,
})
