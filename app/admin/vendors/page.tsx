import { getSessionServer } from "@/lib/getSession";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatDate, VENDOR_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/utils";
import { VendorActions } from "@/components/admin/VendorActions";
import { DocumentReviewSection } from "@/components/admin/DocumentReviewSection";
import Link from "next/link";

export default async function AdminVendorsPage() {
  const session = await getSessionServer();
  if (!session) redirect("/auth/login");

  const user = session.user;
  if (user?.role !== "ADMIN") redirect("/dashboard");

  const vendors = await prisma.vendor.findMany({
    include: {
      user: { select: { email: true, name: true } },
      documents: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusColors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    DOCUMENTS_REQUESTED: "bg-orange-100 text-orange-800",
  };

  const statusIcon: Record<string, string> = {
    PENDING: "⏳",
    APPROVED: "✅",
    REJECTED: "❌",
    DOCUMENTS_REQUESTED: "📄",
  };

  const counts = {
    PENDING: vendors.filter((v) => v.status === "PENDING").length,
    APPROVED: vendors.filter((v) => v.status === "APPROVED").length,
    REJECTED: vendors.filter((v) => v.status === "REJECTED").length,
    DOCUMENTS_REQUESTED: vendors.filter((v) => v.status === "DOCUMENTS_REQUESTED").length,
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Gestion des vendeurs</h1>
        <p className="text-gray-500 mt-1">Vérifiez les inscriptions et les documents soumis</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <p className="text-sm text-yellow-600">En attente</p>
          <p className="text-2xl font-bold text-yellow-800">{counts.PENDING}</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
          <p className="text-sm text-orange-600">Docs demandés</p>
          <p className="text-2xl font-bold text-orange-800">{counts.DOCUMENTS_REQUESTED}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-100">
          <p className="text-sm text-green-600">Approuvés</p>
          <p className="text-2xl font-bold text-green-800">{counts.APPROVED}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-sm text-red-600">Rejetés / Suspendus</p>
          <p className="text-2xl font-bold text-red-800">{counts.REJECTED}</p>
        </div>
      </div>

      {vendors.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center border border-dashed border-gray-300">
          <p className="text-gray-500">Aucun vendeur inscrit</p>
        </div>
      ) : (
        <div className="space-y-5">
          {vendors.map((vendor) => {
            const isSuspended =
              vendor.status === "REJECTED" &&
              (vendor.rejectionReason?.startsWith("[SUSPENDU]") ?? false);

            const requestedTypes = vendor.requestedDocuments as string[];
            const hasDocuments = vendor.documents.length > 0;
            const pendingDocs = vendor.documents.filter((d) => d.status === "PENDING").length;
            const hasDocsToReview =
              vendor.status === "DOCUMENTS_REQUESTED" && hasDocuments;

            return (
              <div
                key={vendor.id}
                className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                  hasDocsToReview && pendingDocs > 0
                    ? "border-orange-200"
                    : "border-gray-100"
                }`}
              >
                {/* ── Header vendeur ── */}
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    {/* Infos */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-semibold text-gray-800 text-lg">
                          {vendor.companyName}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            isSuspended
                              ? "bg-red-100 text-red-700"
                              : statusColors[vendor.status]
                          }`}
                        >
                          {statusIcon[isSuspended ? "REJECTED" : vendor.status]}
                          {isSuspended ? "Suspendu" : VENDOR_STATUS_LABELS[vendor.status]}
                        </span>

                        {/* Badge docs à réviser */}
                        {hasDocsToReview && pendingDocs > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500 text-white">
                            🔔 {pendingDocs} doc{pendingDocs > 1 ? "s" : ""} à réviser
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-600">
                        <p><span className="font-medium">Contact :</span> {vendor.user.name}</p>
                        <p><span className="font-medium">Email :</span> {vendor.user.email}</p>
                        <p><span className="font-medium">Téléphone :</span> {vendor.phone}</p>
                        {vendor.siret && (
                          <p><span className="font-medium">SIRET :</span> {vendor.siret}</p>
                        )}
                        <p><span className="font-medium">Adresse :</span> {vendor.address}</p>
                        <p><span className="font-medium">Inscrit le :</span> {formatDate(vendor.createdAt)}</p>
                      </div>

                      {/* Note rejection/suspension */}
                      {vendor.rejectionReason && !isSuspended && (
                        <p className="text-sm text-red-600 mt-2">
                          <span className="font-medium">Note :</span>{" "}
                          {vendor.rejectionReason}
                        </p>
                      )}
                      {isSuspended && (
                        <p className="text-sm text-red-600 mt-2">
                          <span className="font-medium">Motif suspension :</span>{" "}
                          {vendor.rejectionReason?.replace("[SUSPENDU] ", "")}
                        </p>
                      )}

                      {/* Docs demandés — résumé rapide */}
                      {requestedTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {requestedTypes.map((docType) => {
                            const submitted = vendor.documents.find((d) => d.type === docType);
                            const accepted = submitted?.status === "ACCEPTED";
                            const rejected = submitted?.status === "REJECTED";
                            return (
                              <span
                                key={docType}
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                  accepted
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : rejected
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : submitted
                                    ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                    : "bg-gray-50 text-gray-500 border-gray-200"
                                }`}
                              >
                                {accepted ? "✓" : rejected ? "✗" : submitted ? "⏳" : "○"}{" "}
                                {DOCUMENT_TYPE_LABELS[docType] ?? docType}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 items-end flex-shrink-0">
                      <VendorActions
                        vendorId={vendor.id}
                        vendorStatus={vendor.status}
                        isSuspended={isSuspended}
                        submittedDocTypes={vendor.documents.map((d) => d.type as string)}
                      />
                      <Link
                        href={`/admin/clients/${vendor.id}`}
                        className="text-xs text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
                      >
                        Voir le profil complet →
                      </Link>
                    </div>
                  </div>
                </div>

                {/* ── Section révision documents (expandée si docs soumis) ── */}
                {hasDocsToReview && (
                  <div className="border-t border-orange-100 bg-orange-50/40 px-6 py-5">
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
  );
}