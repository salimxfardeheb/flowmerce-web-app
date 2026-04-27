import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcrypt from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { vendor: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vendorId: user.vendor?.id ?? null,
          vendorStatus: user.vendor?.status ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { role: string; vendorId: string | null; vendorStatus: string | null };
        token.role = u.role;
        token.vendorId = u.vendorId;
        token.vendorStatus = u.vendorStatus;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (!token.sub) throw new Error('token.sub missing');
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.vendorId = token.vendorId;
        session.user.vendorStatus = token.vendorStatus;
      }
      return session;
    },
  },
});

