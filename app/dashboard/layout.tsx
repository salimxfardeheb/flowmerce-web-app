import { getSessionServer } from "@/lib/getSession";


import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/layout/SignOutButton";

const navLinks = [
  { href: "/dashboard", label: "Tableau de bord", icon: "🏠" },
  { href: "/dashboard/return-policy", label: "Politique retours", icon: "📋" },
  { href: "/dashboard/api-keys", label: "Clés API", icon: "🔑" },
  { href: "/dashboard/claims", label: "Réclamations", icon: "📩" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionServer();

  if (!session) redirect("/auth/login");

  const user = session.user as any;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <Link href="/" className="text-xl font-bold text-indigo-700">
            Flomerce
          </Link>
          <p className="text-xs text-gray-500 mt-1">Espace vendeur</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          ))}

          {user?.role === "ADMIN" && (
            <>
              <hr className="my-2" />
              <Link
                href="/admin/vendors"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-700 transition-colors"
              >
                <span>⚙️</span>
                Admin - Vendeurs
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-semibold text-indigo-700">
              {user?.name?.[0]?.toUpperCase() ?? "V"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}