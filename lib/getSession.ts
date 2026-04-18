/**
 * getSession.ts — next-auth v5
 *
 * En v5, `auth()` remplace getServerSession ET getToken.
 * Il fonctionne partout : Server Components, Route Handlers, Middleware.
 */
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export type AppSession = Session | null;

/**
 * Pour les Server Components, layouts, et vendorGuard.
 */
export async function getSessionServer(): Promise<AppSession> {
  return await auth();
}

/**
 * Pour les API Route Handlers.
 * En v5, auth() fonctionne dans les route handlers sans req.
 */
export async function getSessionFromRequest(): Promise<AppSession> {
  return await auth();
}