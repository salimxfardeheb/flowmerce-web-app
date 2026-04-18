"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID_CARD: "Carte d'identité nationale",
  BUSINESS_REGISTRATION: "Registre du commerce",
  ADDRESS_PROOF: "Justificatif de domicile",
  TAX_CERTIFICATE: "Attestation fiscale",
  BANK_DETAILS: "RIB / Coordonnées bancaires",
  OTHER: "Autre document",
};

const DOCUMENT_ICONS: Record<string, string> = {
  ID_CARD: "🪪",
  BUSINESS_REGISTRATION: "🏢",
  ADDRESS_PROOF: "🏠",
  TAX_CERTIFICATE: "📑",
  BANK_DETAILS: "🏦",
  OTHER: "📎",
};

type Document = {
  id: string;
  type: string;
  name: string;
  url: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  rejectionReason: string | null;
  createdAt: string;
};

type Props = {
  vendorId: string;
  vendorStatus: string;
  requestedDocuments: string[];
  documents: Document[];
  // Docs déjà soumis mais pas dans requestedDocuments (docs précédents)
  alreadySubmittedTypes: string[];
};

export function DocumentReviewSection({
  vendorId,
  vendorStatus,
  requestedDocuments,
  documents,
  alreadySubmittedTypes,
}: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [autoApprovedMsg, setAutoApprovedMsg] = useState(false);

  // Docs demandés qui ne sont PAS encore soumis (pour bouton "demander docs supp.")
  const notYetSubmitted = requestedDocuments.filter(
    (type) => !documents.find((d) => d.type === type)
  );

  const reviewDoc = async (
    docId: string,
    status: "ACCEPTED" | "REJECTED",
    reason?: string
  ) => {
    setLoadingId(docId);
    const res = await fetch(`/api/vendors/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rejectionReason: reason }),
    });
    const data = await res.json();
    setLoadingId(null);
    setRejectingId(null);
    setRejectReason("");

    if (data.autoApproved) {
      setAutoApprovedMsg(true);
      setTimeout(() => setAutoApprovedMsg(false), 5000);
    }
    router.refresh();
  };

  // Séparer : docs demandés vs docs additionnels soumis spontanément
  const requestedDocs = documents.filter((d) =>
    requestedDocuments.includes(d.type)
  );
  const extraDocs = documents.filter(
    (d) => !requestedDocuments.includes(d.type)
  );

  const allRequestedAccepted =
    requestedDocuments.length > 0 &&
    requestedDocuments.every((type) => {
      const doc = documents.find((d) => d.type === type);
      return doc?.status === "ACCEPTED";
    });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-semibold text-gray-800 text-base">
            📂 Révision des documents
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {documents.filter((d) => d.status === "ACCEPTED").length} accepté(s) ·{" "}
            {documents.filter((d) => d.status === "REJECTED").length} refusé(s) ·{" "}
            {documents.filter((d) => d.status === "PENDING").length} en attente
          </p>
        </div>

        {allRequestedAccepted && vendorStatus !== "APPROVED" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
            ✅ Prêt pour approbation auto
          </span>
        )}
      </div>

      {/* Banner auto-approbation */}
      {autoApprovedMsg && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 font-medium">
          🎉 Tous les documents ont été acceptés — le compte vendeur a été automatiquement approuvé !
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Aucun document soumis pour le moment.
        </p>
      ) : (
        <div className="space-y-3">
          {/* ── Documents demandés ── */}
          {requestedDocuments.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Documents demandés ({requestedDocs.length}/{requestedDocuments.length} soumis)
              </p>

              {/* Docs demandés mais pas encore soumis */}
              {notYetSubmitted.map((type) => (
                <div
                  key={type}
                  className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-gray-200 bg-gray-50"
                >
                  <span className="text-2xl">{DOCUMENT_ICONS[type] ?? "📄"}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600">
                      {DOCUMENT_TYPE_LABELS[type] ?? type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">En attente de soumission par le vendeur</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                    ⏳ Non soumis
                  </span>
                </div>
              ))}

              {/* Docs demandés et soumis */}
              {requestedDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  loadingId={loadingId}
                  rejectingId={rejectingId}
                  rejectReason={rejectReason}
                  onAccept={() => reviewDoc(doc.id, "ACCEPTED")}
                  onStartReject={() => setRejectingId(doc.id)}
                  onConfirmReject={() => reviewDoc(doc.id, "REJECTED", rejectReason)}
                  onCancelReject={() => { setRejectingId(null); setRejectReason(""); }}
                  onReasonChange={setRejectReason}
                />
              ))}
            </>
          )}

          {/* ── Documents additionnels (non demandés) ── */}
          {extraDocs.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4">
                Documents additionnels soumis spontanément
              </p>
              {extraDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  loadingId={loadingId}
                  rejectingId={rejectingId}
                  rejectReason={rejectReason}
                  onAccept={() => reviewDoc(doc.id, "ACCEPTED")}
                  onStartReject={() => setRejectingId(doc.id)}
                  onConfirmReject={() => reviewDoc(doc.id, "REJECTED", rejectReason)}
                  onCancelReject={() => { setRejectingId(null); setRejectReason(""); }}
                  onReasonChange={setRejectReason}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sous-composant carte document ─────────────────────────────
function DocumentCard({
  doc,
  loadingId,
  rejectingId,
  rejectReason,
  onAccept,
  onStartReject,
  onConfirmReject,
  onCancelReject,
  onReasonChange,
}: {
  doc: Document;
  loadingId: string | null;
  rejectingId: string | null;
  rejectReason: string;
  onAccept: () => void;
  onStartReject: () => void;
  onConfirmReject: () => void;
  onCancelReject: () => void;
  onReasonChange: (v: string) => void;
}) {
  const isLoading = loadingId === doc.id;
  const isRejecting = rejectingId === doc.id;

  const statusStyles = {
    PENDING: "bg-yellow-50 border-yellow-200",
    ACCEPTED: "bg-green-50 border-green-200",
    REJECTED: "bg-red-50 border-red-200",
  };

  const statusBadge = {
    PENDING: <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 font-medium">⏳ En attente</span>,
    ACCEPTED: <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">✓ Accepté</span>,
    REJECTED: <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">✗ Refusé</span>,
  };

  return (
    <div className={`rounded-lg border p-4 transition-colors ${statusStyles[doc.status]}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0 mt-0.5">
          {DOCUMENT_ICONS[doc.type] ?? "📄"}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                {doc.name}
              </p>
            </div>
            {statusBadge[doc.status]}
          </div>

          {doc.status === "REJECTED" && doc.rejectionReason && (
            <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded px-2 py-1">
              Motif : {doc.rejectionReason}
            </p>
          )}

          {/* Formulaire motif de refus */}
          {isRejecting && (
            <div className="mt-3">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Motif du refus (optionnel)..."
                className="w-full border border-red-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={onConfirmReject}
                  disabled={isLoading}
                  className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {isLoading ? "..." : "Confirmer le refus"}
                </button>
                <button
                  onClick={onCancelReject}
                  className="text-gray-500 hover:text-gray-700 text-xs px-3 py-1.5"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isRejecting && (
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {/* Lien voir le fichier */}
              <a
                href={`/api/vendors/documents/view?id=${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium"
              >
                👁 Voir le fichier
              </a>

              {/* Boutons accept/reject (toujours disponibles pour re-décider) */}
              {doc.status !== "ACCEPTED" && (
                <button
                  onClick={onAccept}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? "..." : "✓ Accepter"}
                </button>
              )}
              {doc.status !== "REJECTED" && (
                <button
                  onClick={onStartReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-200 disabled:opacity-50"
                >
                  ✗ Refuser
                </button>
              )}
              {doc.status !== "PENDING" && (
                <button
                  onClick={onStartReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ↩ Revoir
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}