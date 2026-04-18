import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS, formatDate } from "@/lib/utils";
import { ClaimActions } from "@/components/claims/ClaimActions";
import { checkVendorAccess } from "@/lib/vendorGuard";

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; source?: string }>;
}) {
  await checkVendorAccess();
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user   = session.user as any;
  const params = await searchParams;

  const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
  // ADMIN sans profil vendeur → redirige vers dashboard qui affiche l'invitation
  if (!vendor && user?.role === "ADMIN") redirect("/dashboard");
  if (!vendor) redirect("/auth/register");

  const where: Record<string, unknown> = { vendorId: vendor.id };
  if (params.status) where.status = params.status;
  if (params.type)   where.type   = params.type;
  if (params.source) where.source = params.source;

  const claims = await prisma.claim.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const total      = claims.length;
  const pending    = claims.filter((c) => c.status === "PENDING").length;
  const hostedPage = claims.filter((c) => (c as any).source === "HOSTED_PAGE").length;
  const highRisk   = claims.filter((c) => ((c as any).fraudScore ?? 0) >= 60).length;
  const withML     = claims.filter((c) => c.aiDecision !== null).length;

  const statusColors: Record<string, string> = {
    PENDING:     "bg-yellow-100 text-yellow-800",
    APPROVED:    "bg-green-100 text-green-800",
    REJECTED:    "bg-red-100 text-red-800",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
  };

  // Labels lisibles pour les décisions ML
  const resolutionLabels: Record<string, { label: string; emoji: string; cls: string }> = {
    Refund:   { label: "Remboursement", emoji: "💰", cls: "bg-green-50 text-green-700 border-green-200"   },
    Exchange: { label: "Échange",       emoji: "🔄", cls: "bg-blue-50 text-blue-700 border-blue-200"      },
    Repair:   { label: "Réparation",    emoji: "🔧", cls: "bg-orange-50 text-orange-700 border-orange-200" },
    Reject:   { label: "Refus",         emoji: "❌", cls: "bg-red-50 text-red-700 border-red-200"         },
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Réclamations clients</h1>
        <p className="text-gray-500 mt-1">{total} réclamation(s) au total</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-800">{total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-xs text-yellow-600">En attente</p>
          <p className="text-2xl font-bold text-yellow-800">{pending}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <p className="text-xs text-purple-600">Analysées ML</p>
          <p className="text-2xl font-bold text-purple-800">{withML}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
          <p className="text-xs text-indigo-600">Via page retour</p>
          <p className="text-2xl font-bold text-indigo-800">{hostedPage}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-xs text-red-600">Risque élevé</p>
          <p className="text-2xl font-bold text-red-800">{highRisk}</p>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <a href="/dashboard/claims"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !params.status && !params.source
              ? "bg-indigo-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
          }`}>
          Toutes
        </a>
        {(["PENDING", "APPROVED", "REJECTED", "IN_PROGRESS"] as const).map((s) => (
          <a key={s} href={`/dashboard/claims?status=${s}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              params.status === s
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
            }`}>
            {CLAIM_STATUS_LABELS[s]}
          </a>
        ))}
        <a href="/dashboard/claims?source=HOSTED_PAGE"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            params.source === "HOSTED_PAGE"
              ? "bg-indigo-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:border-indigo-300"
          }`}>
          🌐 Page retour
        </a>
      </div>

      {/* ── Table ── */}
      {claims.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-dashed border-gray-300">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500">Aucune réclamation trouvée</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Client</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Commande</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Produit</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">🤖 Décision ML</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Risque</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Date</th>
                <th className="px-5 py-3 min-w-[200px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map((claim) => {
                const fraudScore  = (claim as any).fraudScore as number | null;
                const source      = (claim as any).source    as string;
                const productName = (claim as any).productName as string | null;
                const prediction  = claim.prediction as Record<string, unknown> | null;

                // Détecter si la décision ML a été overridée
                const overrideData    = (prediction as any)?.override;
                const displayDecision = overrideData?.resolution ?? claim.aiDecision;
                const isOverridden    = !!overrideData;
                // Données enrichies depuis la page retour hébergée
                const customerPhone   = (prediction as any)?.customerPhone as string | null;
                const productPrice    = (prediction as any)?.productPrice   as number | null;
                const productQty      = (prediction as any)?.productQuantity as number | null;
                const orderTotal      = (prediction as any)?.orderTotal      as number | null;
                const orderAddress    = (prediction as any)?.orderAddress    as string | null;
                const claimShopName   = (prediction as any)?.shopName        as string | null;

                const riskLevel = fraudScore === null ? null
                  : fraudScore >= 60 ? { label: "Élevé",  cls: "bg-red-100 text-red-700",       dot: "bg-red-500"    }
                  : fraudScore >= 35 ? { label: "Moyen",  cls: "bg-orange-100 text-orange-700",  dot: "bg-orange-500" }
                  :                    { label: "Faible", cls: "bg-green-100 text-green-700",   dot: "bg-green-500"  };

                const mlInfo = displayDecision ? resolutionLabels[displayDecision] : null;

                // Confiance ML (aiScore est entre 0 et 1 dans le schema)
                const confidence = claim.aiScore != null ? Math.round(claim.aiScore * 100) : null;

                return (
                  <tr key={claim.id} className="hover:bg-gray-50 transition-colors">

                    {/* Client */}
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-800">{claim.customerName}</p>
                      <p className="text-xs text-gray-500">{claim.customerEmail}</p>
                      {customerPhone && (
                        <p className="text-xs text-gray-500">📞 {customerPhone}</p>
                      )}
                      {source === "HOSTED_PAGE" && (
                        <span className="text-xs text-indigo-500">🌐 page retour</span>
                      )}
                    </td>

                    {/* Commande */}
                    <td className="px-5 py-4">
                      <p className="text-sm text-gray-700 font-mono text-xs">{claim.orderId}</p>
                      {claimShopName && (
                        <p className="text-xs text-gray-400">🛍️ {claimShopName}</p>
                      )}
                      {orderAddress && (
                        <p className="text-xs text-gray-400 max-w-[140px] truncate" title={orderAddress}>
                          📍 {orderAddress}
                        </p>
                      )}
                    </td>

                    {/* Produit */}
                    <td className="px-5 py-4">
                      <p className="text-sm text-gray-700 max-w-[120px] truncate">
                        {productName ?? "—"}
                      </p>
                      {productPrice != null && (
                        <p className="text-xs text-gray-400">
                          {(productPrice as number).toFixed(2)} DA {productQty && productQty > 1 ? `× ${productQty}` : ""}
                        </p>
                      )}
                      {orderTotal != null && (
                        <p className="text-xs font-medium text-indigo-600">Total : {(orderTotal as number).toFixed(2)} DA</p>
                      )}
                    </td>

                    {/* Type */}
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">
                        {CLAIM_TYPE_LABELS[claim.type]}
                      </span>
                    </td>

                    {/* Statut */}
                    <td className="px-5 py-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[claim.status]}`}>
                        {CLAIM_STATUS_LABELS[claim.status]}
                      </span>
                    </td>

                    {/* Décision ML */}
                    <td className="px-5 py-4">
                      {mlInfo ? (
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${mlInfo.cls}`}>
                            {mlInfo.emoji} {mlInfo.label}
                            {isOverridden && (
                              <span className="ml-1 text-xs opacity-70" title="Décision modifiée manuellement">✏️</span>
                            )}
                          </span>
                          {confidence !== null && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-gray-200 rounded-full h-1">
                                <div
                                  className="h-1 rounded-full bg-purple-500"
                                  style={{ width: `${confidence}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">{confidence}%</span>
                            </div>
                          )}
                          {isOverridden && overrideData?.note && (
                            <p className="text-xs text-gray-400 italic truncate max-w-[140px]" title={overrideData.note}>
                              {overrideData.note}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Risque */}
                    <td className="px-5 py-4">
                      {riskLevel ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${riskLevel.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${riskLevel.dot}`} />
                          {riskLevel.label}
                          {fraudScore !== null && (
                            <span className="opacity-60">({Math.round(fraudScore)})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-5 py-4">
                      <p className="text-sm text-gray-500">{formatDate(claim.createdAt)}</p>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <ClaimActions
                        claimId={claim.id}
                        currentStatus={claim.status}
                        aiDecision={claim.aiDecision}
                        aiScore={claim.aiScore}
                        prediction={claim.prediction as Record<string, unknown> | null}
                      />
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