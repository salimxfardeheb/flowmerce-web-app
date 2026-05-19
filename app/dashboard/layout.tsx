import { getSessionServer } from "@/lib/getSession";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { SessionProvider } from "next-auth/react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;

  const sidebar = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <Link href="/" className="block">
          <Image
            src="/logos/logo-lockup.svg"
            alt="Flowmerce"
            width={140}
            height={28}
            priority
          />
        </Link>
        <p className="text-xs text-gray-400 mt-1.5">Espace vendeur</p>
      </div>

      {/* Nav */}
      <DashboardNav isAdmin={user?.role === "ADMIN"} />

      {/* User */}
      <div className="px-4 py-3 border-t border-gray-100 mt-auto">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? "V"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate leading-none">
              {user?.name}
            </p>
            <p className="text-xs text-gray-400 truncate mt-0.5 leading-none">
              {user?.email}
            </p>
          </div>
        </div>
        <SignOutButton />
      </div>
    </>
  );

  return (
    <SessionProvider session={session}>
      <SidebarShell sidebar={sidebar}>
        {children}
      </SidebarShell>
    </SessionProvider>
  );
}