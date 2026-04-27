"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Building2,
  Home,
  Receipt,
  Paperclip,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  RotateCcw,
  Check,
  X,
  FileText,
} from "lucide-react";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID_CARD:               "Carte nationale d'identité (CNI) ou passeport",
  BUSINESS_REGISTRATION: "Registre du commerce (RC)",
  ADDRESS_PROOF:         "Justificatif de domicile ou  Facture eau/gaz/électricité < 3 mois",
  TAX_CERTIFICATE:       "Numéro d'identification fiscale (NIF)",
  OTHER:                 "Autre document",
};

const DOCUMENT_TYPE_ICONS: Record<string, React.ElementType> = {
  ID_CARD:               CreditCard,
  BUSINESS_REGISTRATION: Building2,
  ADDRESS_PROOF:         Home,
  TAX_CERTIFICATE:       Receipt,
  OTHER:                 Paperclip,
};

type Document = {
  id:              string;
  type:            string;
  name:            string;
  url:             string;
  status:          "PENDING" | "ACCEPTED" | "REJECTED";
  rejectionReason: string | null;
  createdAt:       string;
};

type Props = {
  vendorId:              string;
  vendorStatus:          string;
  requestedDocuments:    string[];
  documents:             Document[];
  alreadySubmittedTypes: string[];
};

export function DocumentReviewSection({
  vendorStatus,
  requestedDocuments,
  documents,
}: Props) {
  const router                                    = useRouter();
  const [loadingId, setLoadingId]                 = useState<string | null>(null);
  const [rejectingId, setRejectingId]             = useState<string | null>(null);
  const [rejectReason, setRejectReason]           = useState("");
  const [autoApprovedMsg, setAutoApprovedMsg]     = useState(false);

  const notYetSubmitted = requestedDocuments.filter(
    (type) => !documents.find((d) => d.type === type)
  );

  const reviewDoc = async (
    docId: string,
    status: "ACCEPTED" | "REJECTED",
    reason?: string
  ) => {
    setLoadingId(docId);
    const res  = await fetch(`/api/vendors/documents/${docId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status, rejectionReason: reason }),
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

  const requestedDocs = documents.filter((d) => requestedDocuments.includes(d.type));
  const extraDocs     = documents.filter((d) => !requestedDocuments.includes(d.type));

  const allRequestedAccepted =
    requestedDocuments.length > 0 &&
    requestedDocuments.every((type) => documents.find((d) => d.type === type)?.status === "ACCEPTED");

  const accepted = documents.filter((d) => d.status === "ACCEPTED").length;
  const rejected = documents.filter((d) => d.status === "REJECTED").length;
  const pending  = documents.filter((d) => d.status === "PENDING").length;

  return (
    <div className="space-y-4">

      {/* En-tête section */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={13} className="text-gray-400" />
            Révision des documents
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {accepted} accepté{accepted !== 1 ? "s" : ""}, {rejected} refusé{rejected !== 1 ? "s" : ""}, {pending} en attente
          </p>
        </div>
        {allRequestedAccepted && vendorStatus !== "APPROVED" && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={11} />
            Prêt pour approbation
          </span>
        )}
      </div>

      {/* Bannière approbation automatique */}
      {autoApprovedMsg && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700 font-medium">
          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          Tous les documents ont été acceptés — le compte vendeur a été automatiquement approuvé.
        </div>
      )}

      {documents.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Aucun document soumis pour le moment.
        </p>
      ) : (
        <div className="space-y-2">

          {/* Documents demandés */}
          {requestedDocuments.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Documents demandés ({requestedDocs.length}/{requestedDocuments.length} soumis)
              </p>

              {notYetSubmitted.map((type) => {
                const TypeIcon = DOCUMENT_TYPE_ICONS[type] ?? Paperclip;
                return (
                  <div
                    key={type}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-gray-200 bg-white"
                  >
                    <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                      <TypeIcon size={13} className="text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">
                        {DOCUMENT_TYPE_LABELS[type] ?? type}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">En attente de soumission</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200">
                      <Clock size={10} />
                      Non soumis
                    </span>
                  </div>
                );
              })}

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

          {/* Documents additionnels */}
          {extraDocs.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">
                Documents additionnels
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

// ── Carte document ────────────────────────────────────────────
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
  doc:             Document;
  loadingId:       string | null;
  rejectingId:     string | null;
  rejectReason:    string;
  onAccept:        () => void;
  onStartReject:   () => void;
  onConfirmReject: () => void;
  onCancelReject:  () => void;
  onReasonChange:  (v: string) => void;
}) {
  const isLoading   = loadingId === doc.id;
  const isRejecting = rejectingId === doc.id;

  const TypeIcon = DOCUMENT_TYPE_ICONS[doc.type] ?? Paperclip;

  const statusConfig = {
    PENDING:  { label: "En attente", Icon: Clock,         classes: "bg-amber-50 text-amber-700 border-amber-200",  card: "border-gray-200 bg-white"   },
    ACCEPTED: { label: "Accepté",    Icon: CheckCircle2,  classes: "bg-green-50 text-green-700 border-green-200",  card: "border-green-200 bg-green-50/30" },
    REJECTED: { label: "Refusé",     Icon: XCircle,       classes: "bg-red-50 text-red-700 border-red-200",        card: "border-red-200 bg-red-50/30"     },
  }[doc.status];

  return (
    <div className={`rounded-lg border px-4 py-3 ${statusConfig.card}`}>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-md bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
          <TypeIcon size={13} className="text-gray-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800">
                {DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{doc.name}</p>
            </div>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${statusConfig.classes}`}>
              <statusConfig.Icon size={10} />
              {statusConfig.label}
            </span>
          </div>

          {doc.status === "REJECTED" && doc.rejectionReason && (
            <p className="text-xs text-red-600 mt-2 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              <span className="font-semibold">Motif : </span>{doc.rejectionReason}
            </p>
          )}

          {/* Saisie motif de refus */}
          {isRejecting && (
            <div className="mt-3">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder="Motif du refus (optionnel)"
                className="w-full border border-red-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-300 bg-white"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={onConfirmReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <X size={11} />
                  )}
                  Confirmer le refus
                </button>
                <button
                  onClick={onCancelReject}
                  className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isRejecting && (
            <div className="flex items-center gap-3 mt-2.5">
              <a
                href={`/api/vendors/documents/view?id=${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <Eye size={11} />
                Voir le fichier
              </a>

              {doc.status !== "ACCEPTED" && (
                <button
                  onClick={onAccept}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 bg-green-600 text-white px-2.5 py-1 rounded text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isLoading ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={11} />
                  )}
                  Accepter
                </button>
              )}

              {doc.status !== "REJECTED" && (
                <button
                  onClick={onStartReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded text-xs font-semibold hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
                >
                  <X size={11} />
                  Refuser
                </button>
              )}

              {doc.status !== "PENDING" && (
                <button
                  onClick={onStartReject}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <RotateCcw size={11} />
                  Revoir
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
