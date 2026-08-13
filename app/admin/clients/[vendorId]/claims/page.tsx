import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Pagination } from "@/components/dashboard/ui";
import {
  VendorClaimsEmpty,
  VendorClaimsTable,
} from "@/components/admin/VendorClaimsTable";

const PAGE_SIZE = 10;

export default async function AdminVendorClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");
  if (session.user?.role !== "ADMIN") redirect("/dashboard");

  const { vendorId } = await params;
  const { page: pageParam } = await searchParams;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, companyName: true },
  });
  // Même repli que la fiche client : un identifiant inconnu retombe sur la liste.
  if (!vendor) redirect("/admin/clients");

  const total = await prisma.claim.count({ where: { vendorId } });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Une page hors bornes (lien périmé, saisie manuelle) retombe sur la dernière
  // plutôt que d'afficher un tableau vide.
  const requested = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const page = Math.min(requested, totalPages);

  const claims = await prisma.claim.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      customerName: true,
      customerEmail: true,
      orderId: true,
      type: true,
      status: true,
      aiScore: true,
      createdAt: true,
    },
  });

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <Link
          href={`/admin/clients/${vendor.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Retour à {vendor.companyName}
        </Link>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-sm font-semibold text-gray-900">
                Toutes les réclamations
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{vendor.companyName}</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full tabular-nums">
              {total} au total
            </span>
          </div>

          {total === 0 ? (
            <VendorClaimsEmpty />
          ) : (
            <>
              <VendorClaimsTable claims={claims} />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                label="réclamations"
                hrefFor={(p) =>
                  p > 1
                    ? `/admin/clients/${vendor.id}/claims?page=${p}`
                    : `/admin/clients/${vendor.id}/claims`
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
