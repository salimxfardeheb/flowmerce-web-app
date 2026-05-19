import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  VENDOR_STATUS_LABELS,
  CLAIM_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  formatDate,
} from "@/lib/utils";
import { DocumentUploadSection } from "@/components/vendor/DocumentUploadSection";
import {
  Shield,
  Settings,
  XCircle,
  Clock,
  FileText,
  Key,
  Inbox,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  Cpu,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;

  const vendor = await prisma.vendor.findUnique({
    where: { userId: user.id },
    include: {
      returnPolicy: true,
      apiKeys: { where: { isActive: true } },
      claims: { orderBy: { createdAt: "desc" } },
      documents: true,
    },
  });

  // ── Admin sans profil vendeur ──
  if (!vendor && user?.role === "ADMIN") {
    return (
      <div className="p-4 sm:p-8 max-w-3xl w-full">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl font-semibold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compte administrateur</p>
        </div>
        <div className="rounded-lg p-4 sm:p-5 mb-4 sm:mb-5 border bg-indigo-50 border-indigo-200">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-indigo-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                Vous n&apos;avez pas encore de profil vendeur
              </p>
              <p className="text-sm text-indigo-700 mt-1">
                En tant qu&apos;administrateur, vous pouvez créer un profil
                vendeur pour accéder à toutes les fonctionnalités du dashboard.
              </p>
              <Link
                href="/dashboard/setup-vendor"
                className="inline-block mt-3 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Créer mon profil vendeur
              </Link>
            </div>
          </div>
        </div>
        <div className="rounded-lg p-4 sm:p-5 border bg-white border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Settings size={12} className="text-gray-400" />
            Administration
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/vendors"
              className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              Gérer les vendeurs
            </Link>
            <Link
              href="/admin/clients"
              className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              Gérer les clients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!vendor) redirect("/auth/register");

  // ── Métriques calculées ──
  const allClaims       = vendor.claims;
  const totalClaims     = allClaims.length;
  const pendingClaims   = allClaims.filter((c) => c.status === "PENDING").length;
  const approvedClaims  = allClaims.filter((c) => c.status === "APPROVED").length;
  const rejectedClaims  = allClaims.filter((c) => c.status === "REJECTED").length;
  const inProgressClaims = allClaims.filter((c) => c.status === "IN_PROGRESS").length;
  const highRiskClaims  = allClaims.filter((c) => (c.fraudScore ?? 0) >= 60).length;
  const aiDecisions     = allClaims.filter((c) => c.aiDecision !== null).length;
  const approvalRate    = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : null;
  const recentClaims    = allClaims.slice(0, 5);

  // ── Statut du compte ──
  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  const suspendReason = isSuspended
    ? vendor.rejectionReason?.replace("[SUSPENDU] ", "")
    : null;

  const isBlocked =
    isSuspended ||
    vendor.status === "PENDING" ||
    vendor.status === "DOCUMENTS_REQUESTED";

  const statusColors: Record<string, string> = {
    PENDING:     "bg-amber-100 text-amber-800",
    APPROVED:    "bg-green-100 text-green-800",
    REJECTED:    "bg-red-100 text-red-800",
    DOCUMENTS_REQUESTED: "bg-amber-100 text-amber-800",
  };

  const claimStatusStyle: Record<string, string> = {
    PENDING:     "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED:    "bg-green-50 text-green-700 border-green-200",
    REJECTED:    "bg-red-50 text-red-700 border-red-200",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border-blue-200",
  };

  const BlockedIcon = isSuspended
    ? XCircle
    : vendor.status === "PENDING"
    ? Clock
    : FileText;

  const blockedIconColor = isSuspended
    ? "text-red-500"
    : vendor.status === "PENDING"
    ? "text-amber-500"
    : "text-amber-500";

  // ── Segments distribution ──
  const segments = [
    { label: "En attente", count: pendingClaims,    pct: totalClaims > 0 ? (pendingClaims / totalClaims) * 100 : 0,    color: "bg-amber-400"  },
    { label: "Approuvées", count: approvedClaims,   pct: totalClaims > 0 ? (approvedClaims / totalClaims) * 100 : 0,   color: "bg-green-500"  },
    { label: "Refusées",   count: rejectedClaims,   pct: totalClaims > 0 ? (rejectedClaims / totalClaims) * 100 : 0,   color: "bg-red-500"    },
    { label: "En cours",   count: inProgressClaims, pct: totalClaims > 0 ? (inProgressClaims / totalClaims) * 100 : 0, color: "bg-blue-500"   },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-5xl w-full">

      {/* ── En-tête ── */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold text-gray-900">{user.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{vendor.companyName}</p>
      </div>

      {/* ── Bannière de blocage ── */}
      {isBlocked && (
        <div
          className={`rounded-lg p-5 mb-8 border ${
            isSuspended
              ? "bg-red-50 border-red-200"
              : vendor.status === "PENDING"
              ? "bg-amber-50 border-amber-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <BlockedIcon size={16} className={`${blockedIconColor} shrink-0 mt-0.5`} />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">
                {isSuspended
                  ? "Votre compte a été suspendu"
                  : vendor.status === "PENDING"
                  ? "Compte en cours de vérification"
                  : "Documents supplémentaires requis"}
              </p>
              {isSuspended && suspendReason && (
                <p className="text-sm text-red-700 mt-1.5">
                  <strong>Motif :</strong> {suspendReason}
                </p>
              )}
              {vendor.status === "PENDING" && (
                <p className="text-sm text-gray-600 mt-1.5">
                  Votre inscription est en cours de vérification. L&apos;accès
                  aux fonctionnalités sera activé dès l&apos;approbation de
                  votre compte.
                </p>
              )}
              {vendor.status === "DOCUMENTS_REQUESTED" && (
                <p className="text-sm text-amber-700 mt-1.5">
                  Notre équipe a besoin de documents supplémentaires.
                  {vendor.rejectionReason && (
                    <span className="block mt-1">
                      <strong>Message :</strong> {vendor.rejectionReason}
                    </span>
                  )}
                </p>
              )}
              {(isSuspended || vendor.status === "PENDING") && (
                <p className="text-sm text-gray-500 mt-2">
                  Pour toute question, contactez notre support.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Upload documents ── */}
      {vendor.status === "DOCUMENTS_REQUESTED" && (
        <DocumentUploadSection
          requestedDocuments={vendor.requestedDocuments as string[]}
          uploadedDocuments={vendor.documents.map((d) => ({
            type: d.type as string,
            name: d.name,
            url: d.url,
          }))}
        />
      )}

      {/* ── Refus simple ── */}
      {vendor.status === "REJECTED" && !isSuspended && (
        <div className="rounded-lg p-5 mb-8 border bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Statut :{" "}
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[vendor.status]}`}>
                  {VENDOR_STATUS_LABELS[vendor.status]}
                </span>
              </p>
              <p className="text-sm text-red-700 mt-1">
                Votre inscription a été refusée.{" "}
                {vendor.rejectionReason && (
                  <strong>Motif : {vendor.rejectionReason}</strong>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard actif ── */}
      {vendor.status === "APPROVED" && (
        <div className="space-y-6">

          {/* ─── A : Métriques enrichies ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {/* Total */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total réclamations
              </p>
              <p className="text-xl sm:text-2xl font-semibold text-gray-900 mt-1.5 tabular-nums">
                {totalClaims}
              </p>
            </div>

            {/* En attente */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                En attente
              </p>
              <div className="flex items-end justify-between mt-1.5">
                <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${pendingClaims > 0 ? "text-amber-500" : "text-gray-900"}`}>
                  {pendingClaims}
                </p>
                {pendingClaims > 0 && (
                  <span className="text-xs text-amber-500 font-medium pb-0.5 hidden sm:block">Action requise</span>
                )}
              </div>
            </div>

            {/* Taux d'approbation */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Taux d&apos;approbation
              </p>
              <div className="flex items-end gap-2 mt-1.5">
                <p className="text-xl sm:text-2xl font-semibold text-green-600 tabular-nums">
                  {approvalRate !== null ? `${approvalRate}%` : "—"}
                </p>
                {approvalRate !== null && (
                  <TrendingUp size={14} className="text-green-500 mb-1" />
                )}
              </div>
              {approvalRate !== null && (
                <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${approvalRate}%` }}
                  />
                </div>
              )}
            </div>

            {/* Approuvées */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 size={12} className="text-green-500" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Approuvées
                </p>
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-gray-900 tabular-nums">
                {approvedClaims}
              </p>
            </div>

            {/* Risque élevé */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldAlert size={12} className={highRiskClaims > 0 ? "text-red-500" : "text-gray-400"} />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Risque élevé
                </p>
              </div>
              <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${highRiskClaims > 0 ? "text-red-600" : "text-gray-900"}`}>
                {highRiskClaims}
              </p>
            </div>

            {/* Décisions automatiques */}
            <div className="bg-white rounded-lg p-3 sm:p-5 border border-gray-200">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Cpu size={12} className="text-indigo-500" />
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Décisions auto
                </p>
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-indigo-600 tabular-nums">
                {aiDecisions}
              </p>
            </div>
          </div>

          {/* ─── B : Distribution des statuts ─── */}
          {totalClaims > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Répartition des statuts
                </p>
                <span className="text-xs text-gray-400 tabular-nums">
                  {totalClaims} réclamation{totalClaims > 1 ? "s" : ""}
                </span>
              </div>

              {/* Barre empilée */}
              <div className="flex h-2 rounded-full overflow-hidden gap-px mb-4">
                {segments
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.label}
                      className={`${s.color} transition-all`}
                      style={{ width: `${s.pct}%` }}
                      title={`${s.label} : ${s.count}`}
                    />
                  ))}
                {totalClaims === 0 && (
                  <div className="bg-gray-100 w-full" />
                )}
              </div>

              {/* Légende */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {segments.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${s.color}`} />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-500 truncate">{s.label}</p>
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">
                        {s.count}
                        <span className="text-xs font-normal text-gray-400 ml-1">
                          {totalClaims > 0 ? `${Math.round(s.pct)}%` : ""}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── C : Réclamations récentes ─── */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">
                Réclamations récentes
              </p>
              <Link
                href="/dashboard/claims"
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Voir tout
                <ChevronRight size={13} />
              </Link>
            </div>

            {recentClaims.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Inbox size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Aucune réclamation pour le moment</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Client</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Type</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Statut</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Risque</th>
                      <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-5 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentClaims.map((claim) => {
                      const fraudScore = claim.fraudScore;
                      const riskLevel =
                        fraudScore === null
                          ? null
                          : fraudScore >= 60
                          ? { label: "Élevé",  cls: "text-red-600",    dot: "bg-red-500"    }
                          : fraudScore >= 35
                          ? { label: "Modéré", cls: "text-amber-600",  dot: "bg-amber-500"  }
                          : { label: "Faible", cls: "text-green-600",  dot: "bg-green-500"  };

                      return (
                        <tr key={claim.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-medium text-gray-800">{claim.customerName}</p>
                            <p className="text-xs text-gray-400">{claim.customerEmail}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-sm text-gray-600">
                              {CLAIM_TYPE_LABELS[claim.type] ?? claim.type}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${claimStatusStyle[claim.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                              {CLAIM_STATUS_LABELS[claim.status] ?? claim.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {riskLevel ? (
                              <span className={`flex items-center gap-1.5 text-xs font-medium ${riskLevel.cls}`}>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${riskLevel.dot}`} />
                                {riskLevel.label}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-gray-400">
                              {formatDate(claim.createdAt)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Navigation ─── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Navigation
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">

              <Link
                href="/dashboard/return-policy"
                className="group flex items-center gap-4 bg-white border border-gray-200 hover:border-indigo-300 rounded-lg p-4 transition-all hover:shadow-sm"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                  <FileText size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                    Politique de retours
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {vendor.returnPolicy
                      ? `Délai ${vendor.returnPolicy.maxClaimDays}j · ${vendor.returnPolicy.validationMode === "AI_AUTO" ? "Automatique" : "Manuel"}`
                      : "Non configurée"}
                  </p>
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </Link>

              <Link
                href="/dashboard/api-keys"
                className="group flex items-center gap-4 bg-white border border-gray-200 hover:border-indigo-300 rounded-lg p-4 transition-all hover:shadow-sm"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors">
                  <Key size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                    Clés API
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {vendor.apiKeys.length} clé{vendor.apiKeys.length !== 1 ? "s" : ""} active{vendor.apiKeys.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </Link>

              <Link
                href="/dashboard/claims"
                className="group flex items-center gap-4 bg-white border border-gray-200 hover:border-indigo-300 rounded-lg p-4 transition-all hover:shadow-sm"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${pendingClaims > 0 ? "bg-amber-50 group-hover:bg-amber-100" : "bg-indigo-50 group-hover:bg-indigo-100"}`}>
                  <Inbox size={16} className={pendingClaims > 0 ? "text-amber-500" : "text-indigo-600"} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
                      Réclamations
                    </p>
                    {pendingClaims > 0 && (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold tabular-nums">
                        {pendingClaims}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pendingClaims > 0
                      ? `${pendingClaims} en attente de traitement`
                      : `${totalClaims} au total`}
                  </p>
                </div>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </Link>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
