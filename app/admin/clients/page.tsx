import { getSessionServer } from "@/lib/getSession";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Store, CheckCircle2, XCircle } from "lucide-react";

export default async function AdminClientsPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const vendors = await prisma.vendor.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    include: {
      user:         { select: { email: true, name: true } },
      returnPolicy: true,
      apiKeys:      { where: { isActive: true } },
      claims:       { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const approved  = vendors.filter((v) => v.status === "APPROVED");
  const suspended = vendors.filter(
    (v) => v.status === "REJECTED" && v.rejectionReason?.startsWith("[SUSPENDU]")
  );
  const totalClaims = vendors.reduce((sum, v) => sum + v.claims.length, 0);

  return (
    <>
      {/* ── En-tête de page ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3 sm:py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">Boutiques</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {approved.length} active{approved.length !== 1 ? "s" : ""}, {suspended.length} suspendue{suspended.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Store size={13} />
            <span>{vendors.length} boutique{vendors.length !== 1 ? "s" : ""} au total</span>
          </div>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "Boutiques actives",  value: approved.length,  color: "text-green-600" },
            { label: "Suspendues",         value: suspended.length, color: "text-red-500"   },
            { label: "Total réclamations", value: totalClaims,      color: "text-indigo-600"},
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {vendors.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-gray-200 p-12 text-center">
            <Store size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 font-medium">Aucune boutique approuvée</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full min-w-175">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    "Boutique",
                    "Contact",
                    "Politique retour",
                    "Clés API",
                    "Réclamations",
                    "Statut",
                    "Inscrit le",
                    "",
                  ].map((col) => (
                    <th
                      key={col}
                      className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map((vendor) => {
                  const isSuspended =
                    vendor.status === "REJECTED" &&
                    vendor.rejectionReason?.startsWith("[SUSPENDU]");
                  const pendingClaims = vendor.claims.filter(
                    (c) => c.status === "PENDING"
                  ).length;

                  return (
                    <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-800">
                          {vendor.companyName}
                        </p>
     
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-gray-700">{vendor.user.name}</p>
                        <p className="text-xs text-gray-400">{vendor.user.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        {vendor.returnPolicy ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">
                            <CheckCircle2 size={10} />
                            {vendor.returnPolicy.maxClaimDays}j
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Non configurée</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm font-medium text-gray-700 tabular-nums">
                          {vendor.apiKeys.length}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-sm text-gray-700 tabular-nums">
                          {vendor.claims.length}
                        </span>
                        {pendingClaims > 0 && (
                          <span className="ml-1.5 text-xs text-orange-600 font-medium">
                            ({pendingClaims} en attente)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            <XCircle size={10} />
                            Suspendue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            <CheckCircle2 size={10} />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-xs text-gray-500">{formatDate(vendor.createdAt)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/clients/${vendor.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline whitespace-nowrap"
                        >
                          Voir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
