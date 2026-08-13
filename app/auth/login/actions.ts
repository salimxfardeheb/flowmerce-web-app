"use server";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuthError } from "next-auth";

export async function loginAction(
  formData: FormData,
): Promise<{ error?: string; redirectTo?: string }> {
  const email    = String(formData.get("email")    ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email et mot de passe requis" };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email ou mot de passe incorrect" };
    }
    throw error;
  }

  // La session vient d'être posée dans un cookie de *réponse* : `auth()` ne la
  // voit pas encore dans cette même action. On relit donc le rôle en base pour
  // choisir la destination — un administrateur atterrit sur le panel admin,
  // pas sur l'espace vendeur.
  const user = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });

  return { redirectTo: user?.role === "ADMIN" ? "/admin" : "/dashboard" };
}
