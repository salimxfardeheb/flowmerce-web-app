"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-[13px] font-medium text-body transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <LogOut size={15} strokeWidth={1.75} aria-hidden />
      Se déconnecter
    </button>
  );
}
