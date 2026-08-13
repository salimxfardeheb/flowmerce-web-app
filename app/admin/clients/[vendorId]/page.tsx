import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  formatDate,
  CLAIM_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, Circle,
  ArrowLeft, ArrowRight, Mail, Phone, MapPin, Globe,
  Key, Shield, CalendarDays, AlertTriangle,
} from "lucide-react";
import { VendorDetailActions } from "@/components/admin/VendorDetailActions";
import { DocumentReviewSection } from "@/components/admin/DocumentReviewSection";
import { VendorClaimsTable } from "@/components/admin/VendorClaimsTable";

/** Nombre de réclamations affichées sur la fiche ; le reste vit sur `/claims`. */
const RECENT_CLAIMS = 5;

export default async function AdminVendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const { vendorId } = await params;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      user: { select: { email: true, name: true, createdAt: true } },
      returnPolicy: true,
      apiKeys: true,
      documents: { orderBy: { createdAt: "desc" } },
      claims: { orderBy: { createdAt: "desc" }, take: RECENT_CLAIMS },
    },
  });

  if (!vendor) redirect("/admin/clients");

  // Les compteurs se calculaient sur les réclamations chargées : le « Total »
  // plafonnait donc au `take` de la requête. On les demande à la base.
  const statusCounts = await prisma.claim.groupBy({
    by: ["status"],
    where: { vendorId },
    _count: { _all: true },
  });

  const countFor = (status: string) =>
    statusCounts.find((s) => s.status === status)?._count._all ?? 0;

  const claimStats = {
    total:    statusCounts.reduce((sum, s) => sum + s._count._all, 0),
    pending:  countFor("PENDING"),
    approved: countFor("APPROVED"),
    rejected: countFor("REJECTED"),
  };

  const isSuspended =
    vendor.status === "REJECTED" &&
    (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

  const suspendReason = isSuspended
    ? vendor.rejectionReason?.replace("[SUSPENDU] ", "")
    : null;

  const activeKeys = vendor.apiKeys.filter((k) => k.isActive);

  const policy = vendor.returnPolicy;

  const acceptedTypesLabels =
    policy?.acceptedTypes?.map((t) => CLAIM_TYPE_LABELS[t] ?? t).join(", ") ?? "Non configuré";

  const fraudLevel = policy
    ? policy.fraudScoreThreshold >= 80
      ? { label: "Tolérant", color: "text-green-700", bg: "bg-green-50", border: "border-green-200" }
      : policy.fraudScoreThreshold >= 55
      ? { label: "Équilibré", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" }
      : { label: "Strict", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" }
    : null;

  const requestedTypes        = vendor.requestedDocuments as string[];
  const alreadySubmittedTypes = vendor.documents
    .map((d) => d.type as string)
    .filter((t) => !requestedTypes.includes(t));
  const notYetSubmittedTypes  = requestedTypes.filter(
    (t) => !vendor.documents.find((d) => d.type === t)
  );

  const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
    PENDING:             { label: "En attente",    cls: "bg-yellow-50 text-yellow-700 border-yellow-200",  dot: "bg-yellow-400"  },
    APPROVED:            { label: "Active",        cls: "bg-green-50 text-green-700 border-green-200",    dot: "bg-green-500"   },
    REJECTED:            { label: isSuspended ? "Suspendue" : "Refusée", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
    DOCUMENTS_REQUESTED: { label: "Docs demandés", cls: "bg-orange-50 text-orange-700 border-orange-200", dot: "bg-orange-400"  },
  };
  const badge = statusConfig[vendor.status] ?? { label: vendor.status, cls: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400" };

  // Initiales pour l'avatar
  const initials = vendor.companyName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* ── Breadcrumb ── */}
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Retour aux boutiques
        </Link>

        {/* ── Header ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              {/* Avatar initiales */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                <span className="text-xs sm:text-sm font-bold text-indigo-700">
                  {initials}
                </span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                    {vendor.companyName}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shrink-0 ${badge.cls}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-1.5 text-xs text-gray-400">
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{vendor.user.email}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <CalendarDays className="w-3 h-3" />
                    Inscrit le {formatDate(vendor.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            <VendorDetailActions
              vendorId={vendor.id}
              isSuspended={isSuspended}
              vendorStatus={vendor.status}
              notYetSubmittedTypes={notYetSubmittedTypes}
            />
          </div>
        </div>

        {/* ── Bannière suspension ── */}
        {isSuspended && suspendReason && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 mb-0.5">
                Motif de la suspension
              </p>
              <p className="text-sm text-red-600">{suspendReason}</p>
            </div>
          </div>
        )}

        {/* ── Bannière docs demandés ── */}
        {vendor.status === "DOCUMENTS_REQUESTED" && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4">
            <p className="text-sm font-semibold text-orange-800 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Documents demandés au vendeur
            </p>
            <div className="flex flex-wrap gap-2">
              {requestedTypes.length > 0 ? (
                requestedTypes.map((docType) => {
                  const submitted = vendor.documents.find(
                    (d) => d.type === docType,
                  );
                  const accepted = submitted?.status === "ACCEPTED";
                  const rejected = submitted?.status === "REJECTED";
                  return (
                    <span
                      key={docType}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                        accepted
                          ? "bg-green-50 text-green-700 border-green-200"
                          : rejected
                          ? "bg-red-50 text-red-700 border-red-200"
                          : submitted
                          ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                          : "bg-white text-orange-700 border-orange-300"
                      }`}
                    >
                      {accepted ? (
                        <CheckCircle2 size={10} />
                      ) : rejected ? (
                        <XCircle size={10} />
                      ) : submitted ? (
                        <Clock size={10} />
                      ) : (
                        <Circle size={10} />
                      )}
                      {DOCUMENT_TYPE_LABELS[
                        docType as keyof typeof DOCUMENT_TYPE_LABELS
                      ] ?? docType}
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

        {/* ── Infos boutique + Politique ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Infos boutique */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-5">
              Informations de la boutique
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Mail className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-0.5">Email</dt>
                  <dd className="text-sm font-medium text-gray-800">
                    {vendor.user.email}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-0.5">Téléphone</dt>
                  <dd className="text-sm font-medium text-gray-800">
                    {vendor.phone}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-3 sm:col-span-2">
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" />
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-0.5">Adresse</dt>
                  <dd className="text-sm font-medium text-gray-800">
                    {vendor.address}
                  </dd>
                </div>
              </div>
              {vendor.website && (
                <div className="flex items-start gap-3 sm:col-span-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-500" />
                  </div>
                  <div>
                    <dt className="text-xs text-gray-400 mb-0.5">Site web</dt>
                    <dd className="text-sm font-medium text-indigo-600">
                      {vendor.website}
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Politique de retours */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-5">
              Politique de retours
            </h2>
            {policy ? (
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs text-gray-400 mb-1">Délai maximum</dt>
                  <dd className="text-sm font-semibold text-gray-800">
                    {policy.maxClaimDays} jours
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-1">Types acceptés</dt>
                  <dd className="text-sm font-medium text-gray-800">
                    {acceptedTypesLabels}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-1">Validation</dt>
                  <dd>
                    {policy.validationMode === "AI_AUTO" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        Automatique IA
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-gray-800">
                        Manuelle
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 mb-1">
                    Refus à la livraison
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
                        policy.allowRefusalOnDelivery
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-600 border-gray-200"
                      }`}
                    >
                      {policy.allowRefusalOnDelivery ? (
                        <CheckCircle2 size={10} />
                      ) : (
                        <XCircle size={10} />
                      )}
                      {policy.allowRefusalOnDelivery
                        ? "Autorisé"
                        : "Non autorisé"}
                    </span>
                  </dd>
                </div>
                {fraudLevel && (
                  <div>
                    <dt className="text-xs text-gray-400 mb-1">
                      Seuil anti-fraude
                    </dt>
                    <dd>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${fraudLevel.bg} ${fraudLevel.color} ${fraudLevel.border}`}
                      >
                        {policy.fraudScoreThreshold}/100 — {fraudLevel.label}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Shield className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">
                  Politique non configurée
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Révision documents ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <DocumentReviewSection
            vendorId={vendor.id}
            vendorStatus={vendor.status}
            requestedDocuments={requestedTypes}
            documents={vendor.documents.map((d) => ({
              id: d.id,
              type: d.type as string,
              name: d.name,
              url: `/api/vendors/documents/view?id=${d.id}`,
              status: d.status as "PENDING" | "ACCEPTED" | "REJECTED",
              rejectionReason: d.rejectionReason,
              createdAt: d.createdAt.toISOString(),
            }))}
            alreadySubmittedTypes={alreadySubmittedTypes}
          />
        </div>

        {/* ── Stats réclamations ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 text-center">
            <p className="text-xs font-medium text-gray-400 mb-1.5">Total</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">
              {claimStats.total}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-yellow-100 shadow-sm p-4 sm:p-5 text-center">
            <p className="text-xs font-medium text-yellow-600 mb-1.5">
              En attente
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-yellow-700">
              {claimStats.pending}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-4 sm:p-5 text-center">
            <p className="text-xs font-medium text-green-600 mb-1.5">
              Approuvées
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-green-700">
              {claimStats.approved}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-4 sm:p-5 text-center">
            <p className="text-xs font-medium text-red-500 mb-1.5">Rejetées</p>
            <p className="text-2xl sm:text-3xl font-bold text-red-600">
              {claimStats.rejected}
            </p>
          </div>
        </div>

        {/* ── Réclamations récentes ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-gray-900">
                Réclamations récentes
              </h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {RECENT_CLAIMS} dernières
              </span>
            </div>
            {claimStats.total > 0 && (
              <Link
                href={`/admin/clients/${vendor.id}/claims`}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors group"
              >
                Voir les {claimStats.total} réclamations
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}
          </div>

          <VendorClaimsTable claims={vendor.claims} />
        </div>

        {/* ── Clés API ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-gray-400" />
              Clés API
            </h2>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">
                {activeKeys.length} active{activeKeys.length !== 1 ? "s" : ""}
              </span>
              <span className="text-gray-300">/</span>
              <span>{vendor.apiKeys.length} total</span>
            </div>
          </div>

          {vendor.apiKeys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-gray-200 rounded-xl">
              <Key className="w-7 h-7 text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-400">
                Aucune clé API créée
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {vendor.apiKeys.map((key) => (
                <div
                  key={key.id}
                  className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border transition-opacity ${
                    key.isActive
                      ? "border-gray-200 bg-gray-50/60"
                      : "border-gray-100 bg-gray-50/40 opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        key.isActive ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {key.name}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {key.keyPrefix
                          ? `${key.keyPrefix}••••••••`
                          : "••••••••••••"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        key.isActive
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-gray-100 text-gray-500 border border-gray-200"
                      }`}
                    >
                      {key.isActive ? "Active" : "Révoquée"}
                    </span>
                    {key.lastUsedAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        Utilisée le {formatDate(key.lastUsedAt)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
