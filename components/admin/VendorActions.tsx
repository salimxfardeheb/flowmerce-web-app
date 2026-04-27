"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, FileText, Ban, CreditCard, Building2, Receipt, Home } from "lucide-react";

const ALL_DOCUMENT_OPTIONS = [
  {
    value: "ID_CARD",
    label: "Carte nationale d'identité (CNI) ou passeport",
    hint: "Recto-verso obligatoire",
    icon: CreditCard,
  },
  {
    value: "BUSINESS_REGISTRATION",
    label: "Registre du commerce",
    hint: "RC — extrait original ou certifié conforme",
    icon: Building2,
  },
  {
    value: "TAX_CERTIFICATE",
    label: "Numéro d'identification fiscale",
    hint: "NIF — attestation délivrée par l'administration fiscale",
    icon: Receipt,
  },
  {
    value: "ADDRESS_PROOF",
    label: "Justificatif de domicile",
    hint: "Attestation de résidence ou facture eau / gaz / électricité (< 3 mois)",
    icon: Home,
  },
];

type Props = {
  vendorId: string;
  vendorStatus: string;
  isSuspended: boolean;
  submittedDocTypes: string[];
};

export function VendorActions({
  vendorId,
  vendorStatus,
  isSuspended,
  submittedDocTypes,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showDocRequest, setShowDocRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  const closeAll = () => {
    setShowReject(false);
    setShowDocRequest(false);
    setReason("");
    setSelectedDocs([]);
  };

  const callApi = async (body: object) => {
    setLoading(true);
    await fetch(`/api/vendors/${vendorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
  };

  const approve = async () => {
    await callApi({ status: "APPROVED", rejectionReason: null });
    router.refresh();
  };
  const reactivate = async () => {
    await callApi({ status: "APPROVED", rejectionReason: null });
    router.refresh();
  };
  const confirmReject = async () => {
    if (!reason.trim()) return;
    await callApi({ status: "REJECTED", rejectionReason: reason });
    closeAll();
    router.refresh();
  };
  const confirmSuspend = async () => {
    if (!reason.trim()) return;
    await callApi({
      status: "REJECTED",
      rejectionReason: `[SUSPENDU] ${reason}`,
    });
    closeAll();
    router.refresh();
  };
  const requestDocuments = async () => {
    if (selectedDocs.length === 0) return;
    await callApi({
      status: "DOCUMENTS_REQUESTED",
      rejectionReason: reason || null,
      requestedDocuments: selectedDocs,
    });
    closeAll();
    router.refresh();
  };

  const toggleDoc = (value: string) =>
    setSelectedDocs((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  const renderButtons = () => {
    if (isSuspended) {
      return (
        <button
          onClick={reactivate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {loading ? "…" : "Réactiver"}
        </button>
      );
    }

    return (
      <div className="flex flex-col gap-1.5 min-w-35">
        {vendorStatus !== "APPROVED" && !isSuspended && (
          <button
            onClick={approve}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {loading ? "…" : "Approuver"}
          </button>
        )}
        <button
          onClick={() => {
            setShowDocRequest(true);
            setShowReject(false);
          }}
          className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Demander docs
        </button>
        <button
          onClick={() => {
            setShowReject(true);
            setShowDocRequest(false);
          }}
          className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
        >
          {vendorStatus === "APPROVED" ? (
            <Ban className="w-3.5 h-3.5" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          {vendorStatus === "APPROVED" ? "Suspendre" : "Refuser"}
        </button>
      </div>
    );
  };

  return (
    <>
      {renderButtons()}

      {/* Modal Refus / Suspension */}
      {showReject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {vendorStatus === "APPROVED"
                    ? "Suspendre la boutique"
                    : "Motif de refus"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {vendorStatus === "APPROVED"
                    ? "Le vendeur ne pourra plus accéder à son espace ni utiliser l'API."
                    : "Le vendeur sera notifié avec ce motif."}
                </p>
              </div>
              <button
                onClick={closeAll}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  vendorStatus === "APPROVED"
                    ? "Motif de la suspension…"
                    : "Motif du refus…"
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none transition"
                autoFocus
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={closeAll}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={
                  vendorStatus === "APPROVED" ? confirmSuspend : confirmReject
                }
                disabled={loading || !reason.trim()}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Demande de documents */}
      {showDocRequest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Documents à demander
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Les types déjà soumis sont grisés.
                </p>
              </div>
              <button
                onClick={closeAll}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="space-y-2">
                {ALL_DOCUMENT_OPTIONS.map((opt) => {
                  const alreadySubmitted = submittedDocTypes.includes(opt.value);
                  const isSelected = selectedDocs.includes(opt.value);
                  const Icon = opt.icon;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 px-3.5 py-4 rounded-xl border transition-all ${
                        alreadySubmitted
                          ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                          : isSelected
                            ? "border-indigo-400 bg-indigo-50 shadow-sm cursor-pointer"
                            : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => !alreadySubmitted && toggleDoc(opt.value)}
                        disabled={alreadySubmitted}
                        className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0"
                      />
                      <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${isSelected ? "opacity-100" : "opacity-80"}`}>
                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSelected ? "bg-indigo-100" : "bg-gray-100"
                        }`}>
                          <Icon className={`w-4 h-4 ${isSelected ? "text-indigo-600" : "text-gray-500"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium leading-tight ${isSelected ? "text-indigo-900" : "text-gray-800"}`}>
                            {opt.label}
                          </p>
                          <p className={`text-xs mt-0.5 leading-snug ${isSelected ? "text-indigo-500" : "text-gray-400"}`}>
                            {opt.hint}
                          </p>
                        </div>
                      </div>
                      {alreadySubmitted && (
                        <span className="ml-auto shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          Déjà soumis
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Message additionnel{" "}
                  <span className="font-normal normal-case text-gray-400">
                    — optionnel
                  </span>
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Instructions supplémentaires pour le vendeur…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={closeAll}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={requestDocuments}
                disabled={loading || selectedDocs.length === 0}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "…" : `Demander (${selectedDocs.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
