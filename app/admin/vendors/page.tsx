import type { ElementType } from "react";
import { getSessionServer } from "@/lib/getSession";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatDate, VENDOR_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/utils";
import { VendorActions } from "@/components/admin/VendorActions";
import { DocumentReviewSection } from "@/components/admin/DocumentReviewSection";
import Link from "next/link";
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Bell,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

export default async function AdminVendorsPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const vendors = await prisma.vendor.findMany({
    include: {
      user:      { select: { email: true, name: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusColors: Record<string, string> = {
    PENDING:             "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED:            "bg-green-50 text-green-700 border-green-200",
    REJECTED:            "bg-red-50 text-red-700 border-red-200",
    DOCUMENTS_REQUESTED: "bg-amber-50 text-amber-700 border-amber-200",
  };

  const StatusIcon: Record<string, ElementType> = {
    PENDING:             Clock,
    APPROVED:            CheckCircle2,
    REJECTED:            XCircle,
    DOCUMENTS_REQUESTED: FileText,
  };

  const counts = {
    PENDING:             vendors.filter((v) => v.status === "PENDING").length,
    APPROVED:            vendors.filter((v) => v.status === "APPROVED").length,
    REJECTED:            vendors.filter((v) => v.status === "REJECTED").length,
    DOCUMENTS_REQUESTED: vendors.filter((v) => v.status === "DOCUMENTS_REQUESTED").length,
  };

  const pendingTotal = counts.PENDING + counts.DOCUMENTS_REQUESTED;

  return (
    <>
      {/* ── En-tête ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-3 sm:py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-gray-900">Inscriptions vendeurs</h1>
              {pendingTotal > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <Bell size={10} />
                  {pendingTotal} en attente
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Vérifiez les demandes d&apos;inscription et les documents soumis.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <ClipboardList size={12} />
            <span>{vendors.length} vendeur{vendors.length !== 1 ? "s" : ""} au total</span>
          </div>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: "En attente",    value: counts.PENDING,             color: "text-amber-600",  Icon: Clock          },
            { label: "Docs à fournir", value: counts.DOCUMENTS_REQUESTED, color: "text-amber-600",  Icon: FileText       },
            { label: "Approuvés",     value: counts.APPROVED,            color: "text-green-600",  Icon: CheckCircle2   },
            { label: "Rejetés",       value: counts.REJECTED,            color: "text-red-500",    Icon: XCircle        },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xl font-semibold mt-0.5 tabular-nums ${color}`}>{value}</p>
              </div>
              <Icon size={16} className={`${color} opacity-40 shrink-0`} />
            </div>
          ))}
        </div>

        {/* Liste des vendeurs */}
        {vendors.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-gray-200 py-16 text-center">
            <ClipboardList size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-medium text-gray-500">Aucun vendeur inscrit</p>
            <p className="text-xs text-gray-400 mt-1">Les nouvelles inscriptions apparaîtront ici.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vendors.map((vendor) => {
              const isSuspended =
                vendor.status === "REJECTED" &&
                (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

              const requestedTypes = vendor.requestedDocuments as string[];
              const hasDocuments   = vendor.documents.length > 0;
              const pendingDocs    = vendor.documents.filter((d) => d.status === "PENDING").length;
              const hasDocsToReview = vendor.status === "DOCUMENTS_REQUESTED" && hasDocuments;

              const StatusIconComp = StatusIcon[isSuspended ? "REJECTED" : vendor.status];
              const statusClass    = isSuspended
                ? "bg-red-50 text-red-700 border-red-200"
                : statusColors[vendor.status];
              const statusLabel    = isSuspended ? "Suspendu" : VENDOR_STATUS_LABELS[vendor.status];

              const infoRows = [
                { label: "Contact",     value: vendor.user.name },
                { label: "Email",       value: vendor.user.email },
                { label: "Téléphone",   value: vendor.phone },
                { label: "Adresse",     value: vendor.address },
                { label: "Inscrit le",  value: formatDate(vendor.createdAt) },
              ];

              return (
                <div
                  key={vendor.id}
                  className={`bg-white rounded-lg border overflow-hidden ${
                    hasDocsToReview && pendingDocs > 0
                      ? "border-amber-200"
                      : "border-gray-200"
                  }`}
                >
                  {/* ── Ligne titre ── */}
                  <div className="px-4 sm:px-5 py-3 sm:py-4 flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{vendor.companyName}</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${statusClass}`}>
                        <StatusIconComp size={10} />
                        {statusLabel}
                      </span>
                      {hasDocsToReview && pendingDocs > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500 text-white border border-amber-400">
                          <Bell size={10} />
                          {pendingDocs} doc{pendingDocs > 1 ? "s" : ""} à réviser
                        </span>
                      )}
                    </div>
                    <div className="shrink-0">
                      <VendorActions
                        vendorId={vendor.id}
                        vendorStatus={vendor.status}
                        isSuspended={isSuspended}
                        submittedDocTypes={vendor.documents.map((d) => d.type as string)}
                      />
                    </div>
                  </div>

                  {/* ── Informations ── */}
                  <div className="px-5 pb-4 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      {infoRows.map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-gray-400">{label}</p>
                          <p className="text-xs font-medium text-gray-800 mt-0.5 break-all">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Note rejet ou suspension */}
                    {(vendor.rejectionReason && !isSuspended) && (
                      <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                        <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          <span className="font-semibold">Motif de rejet : </span>
                          {vendor.rejectionReason}
                        </p>
                      </div>
                    )}
                    {isSuspended && (
                      <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                        <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          <span className="font-semibold">Motif de suspension : </span>
                          {vendor.rejectionReason?.replace("[SUSPENDU] ", "")}
                        </p>
                      </div>
                    )}

                    {/* Badges documents demandés */}
                    {requestedTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {requestedTypes.map((docType) => {
                          const submitted = vendor.documents.find((d) => d.type === docType);
                          const accepted  = submitted?.status === "ACCEPTED";
                          const rejected  = submitted?.status === "REJECTED";
                          return (
                            <span
                              key={docType}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                                accepted  ? "bg-green-50 text-green-700 border-green-200"
                              : rejected  ? "bg-red-50 text-red-700 border-red-200"
                              : submitted ? "bg-amber-50 text-amber-700 border-amber-200"
                              :             "bg-gray-50 text-gray-500 border-gray-200"
                              }`}
                            >
                              {accepted  ? <CheckCircle2 size={10} />
                             : rejected  ? <XCircle size={10} />
                             : submitted ? <Clock size={10} />
                             :             <div className="w-2 h-2 rounded-full border border-gray-300" />}
                              {DOCUMENT_TYPE_LABELS[docType as keyof typeof DOCUMENT_TYPE_LABELS] ?? docType}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Lien profil */}
                    <div className="mt-3 flex justify-end">
                      <Link
                        href={`/admin/clients/${vendor.id}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Voir le profil complet
                      </Link>
                    </div>
                  </div>

                  {/* ── Section révision documents ── */}
                  {hasDocsToReview && (
                    <div className="border-t border-amber-100 bg-amber-50/30 px-5 py-5">
                      <DocumentReviewSection
                        vendorId={vendor.id}
                        vendorStatus={vendor.status}
                        requestedDocuments={requestedTypes}
                        documents={vendor.documents.map((d) => ({
                          id:              d.id,
                          type:            d.type as string,
                          name:            d.name,
                          url:             d.url,
                          status:          d.status as "PENDING" | "ACCEPTED" | "REJECTED",
                          rejectionReason: d.rejectionReason,
                          createdAt:       d.createdAt.toISOString(),
                        }))}
                        alreadySubmittedTypes={vendor.documents
                          .map((d) => d.type as string)
                          .filter((t) => !requestedTypes.includes(t))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
