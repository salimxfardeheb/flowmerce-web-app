import { getSessionServer } from "@/lib/getSession";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function AdminClientsPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user as any;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const vendors = await prisma.vendor.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    include: {
      user: { select: { email: true, name: true } },
      returnPolicy: true,
      apiKeys: { where: { isActive: true } },
      claims: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const approved = vendors.filter((v) => v.status === "APPROVED");
  const suspended = vendors.filter(
    (v) => v.status === "REJECTED" && v.rejectionReason?.startsWith("[SUSPENDU]")
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Gestion des boutiques</h1>
        <p className="text-gray-500 mt-1">
          {approved.length} boutique(s) active(s) · {suspended.length} suspendue(s)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-sm text-green-600">Boutiques actives</p>
          <p className="text-2xl font-bold text-green-800">{approved.length}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-sm text-red-600">Suspendues</p>
          <p className="text-2xl font-bold text-red-800">{suspended.length}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <p className="text-sm text-indigo-600">Total réclamations</p>
          <p className="text-2xl font-bold text-indigo-800">
            {vendors.reduce((sum, v) => sum + v.claims.length, 0)}
          </p>
        </div>
      </div>

      {/* Table */}
      {vendors.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-dashed border-gray-300">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-gray-500">Aucune boutique approuvée</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Boutique
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Contact
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Politique
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Clés API
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Réclamations
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Statut
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">
                  Inscrit le
                </th>
                <th className="px-6 py-3" />
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
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-800">
                        {vendor.companyName}
                      </p>
                      {vendor.siret && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          SIRET : {vendor.siret}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{vendor.user.name}</p>
                      <p className="text-xs text-gray-400">{vendor.user.email}</p>
                    </td>
                    <td className="px-6 py-4">
                      {vendor.returnPolicy ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          ✓ {vendor.returnPolicy.maxClaimDays}j
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Non configurée</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-700">
                        {vendor.apiKeys.length}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700">
                        {vendor.claims.length}
                      </span>
                      {pendingClaims > 0 && (
                        <span className="ml-1 text-xs text-orange-600 font-medium">
                          ({pendingClaims} en attente)
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isSuspended ? (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Suspendue
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-500">{formatDate(vendor.createdAt)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/admin/clients/${vendor.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline whitespace-nowrap"
                      >
                        Voir →
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
  );
}
