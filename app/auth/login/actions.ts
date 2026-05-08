"use server";

import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";

export async function loginAction(
  email: string,
  password: string
): Promise<{ error?: string }> {
  try {
    await signIn("credentials", { email, password, redirect: false });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email ou mot de passe incorrect" };
    }
    throw error;
  }
}
