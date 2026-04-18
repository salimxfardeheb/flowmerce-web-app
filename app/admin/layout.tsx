import { getSessionServer } from "@/lib/getSession";

import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/layout/SignOutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user as any;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link href="/" className="text-xl font-bold text-indigo-700">
            Flomerce
          </Link>
          <p className="text-xs text-orange-600 font-semibold mt-1">Administration</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/admin/vendors"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors"
          >
            <span>📋</span>
            Inscriptions
          </Link>
          <Link
            href="/admin/clients"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors"
          >
            <span>🏪</span>
            Boutiques
          </Link>
          <hr className="my-2" />
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            <span>🏠</span>
            Mon compte
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2">{user?.name}</p>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
