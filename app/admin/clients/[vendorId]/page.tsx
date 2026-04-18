import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  formatDate,
  CLAIM_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/utils";
import { VendorDetailActions } from "@/components/admin/VendorDetailActions";
import { DocumentReviewSection } from "@/components/admin/DocumentReviewSection";

export default async function AdminVendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user as any;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const { vendorId } = await params;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      user: { select: { email: true, name: true, createdAt: true } },
      returnPolicy: true,
      apiKeys: true,
      documents: { orderBy: { createdAt: "desc" } },
      claims: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!vendor) redirect("/admin/clients");

  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  const suspendReason = isSuspended
    ? vendor.rejectionReason?.replace("[SUSPENDU] ", "")
    : null;

  const claimStats = {
    total: vendor.claims.length,
    pending: vendor.claims.filter((c) => c.status === "PENDING").length,
    approved: vendor.claims.filter((c) => c.status === "APPROVED").length,
    rejected: vendor.claims.filter((c) => c.status === "REJECTED").length,
  };

  const activeKeys = vendor.apiKeys.filter((k) => k.isActive);

  const claimStatusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
  };

  const policy = vendor.returnPolicy;

  const acceptedTypesLabels =
    policy?.acceptedTypes?.map((t) => CLAIM_TYPE_LABELS[t] ?? t).join(", ") ?? "—";

  const fraudLevel = policy
    ? policy.fraudScoreThreshold >= 80
      ? { label: "Tolérant", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" }
      : policy.fraudScoreThreshold >= 55
      ? { label: "Équilibré", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" }
      : { label: "Strict", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" }
    : null;

  // Docs demandés (types)
  const requestedTypes = vendor.requestedDocuments as string[];

  // Types déjà soumis mais PAS dans requestedTypes (pour les griser dans la modal)
  const alreadySubmittedTypes = vendor.documents
    .map((d) => d.type as string)
    .filter((t) => !requestedTypes.includes(t));

  // Types demandés mais pas encore soumis par le vendeur
  const notYetSubmittedTypes = requestedTypes.filter(
    (t) => !vendor.documents.find((d) => d.type === t)
  );

  const statusBadgeMap: Record<string, { label: string; cls: string }> = {
    PENDING:             { label: "En attente",    cls: "bg-yellow-100 text-yellow-700" },
    APPROVED:            { label: "Active",        cls: "bg-green-100 text-green-700"  },
    REJECTED:            { label: isSuspended ? "Suspendue" : "Refusée", cls: "bg-red-100 text-red-700" },
    DOCUMENTS_REQUESTED: { label: "Docs demandés", cls: "bg-orange-100 text-orange-700" },
  };
  const badge = statusBadgeMap[vendor.status] ?? { label: vendor.status, cls: "bg-gray-100 text-gray-700" };

  return (
    <div className="p-8 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link
            href="/admin/clients"
            className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3"
          >
            ← Retour aux boutiques
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">{vendor.companyName}</h1>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-gray-500 mt-1 text-sm">
            Inscrite le {formatDate(vendor.createdAt)}
          </p>
        </div>

        {/* ✅ Props complets passés à VendorDetailActions */}
        <VendorDetailActions
          vendorId={vendor.id}
          isSuspended={isSuspended}
          vendorStatus={vendor.status}
          notYetSubmittedTypes={notYetSubmittedTypes}
        />
      </div>

      {/* ── Banner suspension ── */}
      {isSuspended && suspendReason && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-700 mb-1">Motif de la suspension</p>
          <p className="text-sm text-red-600">{suspendReason}</p>
        </div>
      )}

      {/* ── Banner docs demandés ── */}
      {vendor.status === "DOCUMENTS_REQUESTED" && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-orange-800 mb-2">
            📄 Documents demandés au vendeur
          </p>
          <div className="flex flex-wrap gap-2">
            {requestedTypes.length > 0 ? (
              requestedTypes.map((docType) => {
                const submitted = vendor.documents.find((d) => d.type === docType);
                const accepted  = submitted?.status === "ACCEPTED";
                const rejected  = submitted?.status === "REJECTED";
                return (
                  <span
                    key={docType}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      accepted  ? "bg-green-50 text-green-700 border-green-200"
                    : rejected  ? "bg-red-50 text-red-700 border-red-200"
                    : submitted ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                    :             "bg-white text-orange-700 border-orange-300"
                    }`}
                  >
                    {accepted ? "✓" : rejected ? "✗" : submitted ? "⏳" : "○"}{" "}
                    {DOCUMENT_TYPE_LABELS[docType] ?? docType}
                  </span>
                );
              })
            ) : (
              <p className="text-sm text-orange-600">
                {vendor.rejectionReason ?? "Aucun type précisé."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Infos vendeur + Politique ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Informations de la boutique</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Responsable</dt>
              <dd className="font-medium text-gray-800 mt-0.5">{vendor.user.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-800 mt-0.5">{vendor.user.email}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Téléphone</dt>
              <dd className="font-medium text-gray-800 mt-0.5">{vendor.phone}</dd>
            </div>
            {vendor.siret && (
              <div>
                <dt className="text-gray-500">SIRET</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{vendor.siret}</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-gray-500">Adresse</dt>
              <dd className="font-medium text-gray-800 mt-0.5">{vendor.address}</dd>
            </div>
            {vendor.website && (
              <div className="col-span-2">
                <dt className="text-gray-500">Site web</dt>
                <dd className="font-medium text-indigo-600 mt-0.5">{vendor.website}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-800 mb-4">Politique de retours</h2>
          {policy ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Délai max</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{policy.maxClaimDays} jours</dd>
              </div>
              <div>
                <dt className="text-gray-500">Types acceptés</dt>
                <dd className="font-medium text-gray-800 mt-0.5">{acceptedTypesLabels}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Validation</dt>
                <dd className="font-medium text-gray-800 mt-0.5">
                  {policy.validationMode === "AI_AUTO" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                      Automatique IA
                    </span>
                  ) : "Manuelle"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Refus livraison</dt>
                <dd className="font-medium text-gray-800 mt-0.5">
                  {policy.allowRefusalOnDelivery ? "Autorisé" : "Non autorisé"}
                </dd>
              </div>
              {fraudLevel && (
                <div>
                  <dt className="text-gray-500">Seuil fraude</dt>
                  <dd className="mt-0.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${fraudLevel.bg} ${fraudLevel.color} border ${fraudLevel.border}`}>
                      {policy.fraudScoreThreshold}/100 — {fraudLevel.label}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-400">Non configurée</p>
          )}
        </div>
      </div>

      {/* ── Détails politique ── */}
      {policy && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-5">Détails de la politique</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                🚫 Catégories non remboursables
              </p>
              {policy.nonRefundableCategories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {policy.nonRefundableCategories.map((cat) => (
                    <span key={cat} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-700 border border-red-100">{cat}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Toutes les catégories sont remboursables</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                ↔️ Échange seulement
              </p>
              {policy.exchangeOnlyCategories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {policy.exchangeOnlyCategories.map((cat) => (
                    <span key={cat} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{cat}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucune restriction</p>
              )}
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                📝 Raisons de retour acceptées
              </p>
              {policy.acceptedReturnReasons.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {policy.acceptedReturnReasons.map((reason) => (
                    <span key={reason} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">{reason}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Toutes les raisons sont acceptées</p>
              )}
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                💳 Remboursement partiel
              </p>
              {policy.partialRefundEnabled ? (
                <div className="flex gap-4">
                  <div className="flex-1 p-3 rounded-lg bg-purple-50 border border-purple-100 text-center">
                    <p className="text-xl font-bold text-purple-700">{policy.partialRefundAfter50pct}%</p>
                    <p className="text-xs text-purple-600 mt-0.5">remboursé si retour après 50% du délai</p>
                  </div>
                  <div className="flex-1 p-3 rounded-lg bg-red-50 border border-red-100 text-center">
                    <p className="text-xl font-bold text-red-700">-{policy.partialRefundUsedPenalty}%</p>
                    <p className="text-xs text-red-600 mt-0.5">pénalité si produit utilisé</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Désactivé — remboursement intégral</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Révision documents ── */}
      <DocumentReviewSection
        vendorId={vendor.id}
        vendorStatus={vendor.status}
        requestedDocuments={requestedTypes}
        documents={vendor.documents.map((d) => ({
          id: d.id,
          type: d.type as string,
          name: d.name,
          url: d.url,
          status: d.status as "PENDING" | "ACCEPTED" | "REJECTED",
          rejectionReason: d.rejectionReason,
          createdAt: d.createdAt.toISOString(),
        }))}
        alreadySubmittedTypes={alreadySubmittedTypes}
      />

      {/* ── Stats réclamations ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center">
          <p className="text-xs text-gray-500 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-800">{claimStats.total}</p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100 text-center">
          <p className="text-xs text-yellow-600 mb-1">En attente</p>
          <p className="text-2xl font-bold text-yellow-800">{claimStats.pending}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100 text-center">
          <p className="text-xs text-green-600 mb-1">Approuvées</p>
          <p className="text-2xl font-bold text-green-800">{claimStats.approved}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100 text-center">
          <p className="text-xs text-red-600 mb-1">Rejetées</p>
          <p className="text-2xl font-bold text-red-800">{claimStats.rejected}</p>
        </div>
      </div>

      {/* ── Réclamations récentes ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">
            Réclamations récentes
            <span className="ml-2 text-sm font-normal text-gray-400">(20 dernières)</span>
          </h2>
        </div>
        {vendor.claims.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune réclamation</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Client</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Commande</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Score IA</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendor.claims.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-gray-800">{claim.customerName}</p>
                    <p className="text-xs text-gray-400">{claim.customerEmail}</p>
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-sm text-gray-700 font-mono">{claim.orderId}</p>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-sm text-gray-700">{CLAIM_TYPE_LABELS[claim.type]}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${claimStatusColors[claim.status]}`}>
                      {CLAIM_STATUS_LABELS[claim.status]}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {claim.aiScore !== null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-12 bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${claim.aiScore >= 0.7 ? "bg-green-500" : claim.aiScore >= 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${claim.aiScore * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{Math.round(claim.aiScore * 100)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-sm text-gray-500">{formatDate(claim.createdAt)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Clés API ── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="font-semibold text-gray-800 mb-4">
          Clés API
          <span className="ml-2 text-sm font-normal text-gray-400">
            {activeKeys.length} active(s) / {vendor.apiKeys.length} total
          </span>
        </h2>
        {vendor.apiKeys.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune clé API créée</p>
        ) : (
          <div className="space-y-2">
            {vendor.apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${key.isActive ? "border-gray-200 bg-gray-50" : "border-gray-100 bg-gray-50 opacity-50"}`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{key.name}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{key.keyPrefix ? `${key.keyPrefix}…` : "••••••••"}</p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${key.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                    {key.isActive ? "Active" : "Révoquée"}
                  </span>
                  {key.lastUsedAt && (
                    <p className="text-xs text-gray-400 mt-1">Utilisée le {formatDate(key.lastUsedAt)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}