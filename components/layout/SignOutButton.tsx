"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="w-full text-sm text-gray-500 hover:text-red-600 text-left transition-colors"
    >
      Se déconnecter
    </button>
  );
}
