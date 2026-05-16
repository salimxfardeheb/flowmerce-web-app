import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node node_modules/jiti/lib/jiti-cli.mjs prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});

