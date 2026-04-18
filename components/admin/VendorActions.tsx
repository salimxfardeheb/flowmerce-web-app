"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ALL_DOCUMENT_OPTIONS = [
  { value: "ID_CARD", label: "Carte d'identité nationale", icon: "🪪" },
  { value: "BUSINESS_REGISTRATION", label: "Registre du commerce", icon: "🏢" },
  { value: "ADDRESS_PROOF", label: "Justificatif de domicile", icon: "🏠" },
  { value: "TAX_CERTIFICATE", label: "Attestation fiscale", icon: "📑" },
  { value: "BANK_DETAILS", label: "RIB / Coordonnées bancaires", icon: "🏦" },
  { value: "OTHER", label: "Autre document", icon: "📎" },
];

type Props = {
  vendorId: string;
  vendorStatus: string;
  isSuspended: boolean;
  // Types de docs déjà soumis par le vendeur (pour les griser dans la modal)
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
    await callApi({ status: "REJECTED", rejectionReason: `[SUSPENDU] ${reason}` });
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

  const toggleDoc = (value: string) => {
    setSelectedDocs((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // ── Boutons selon le statut actuel ────────────────────────────
  const renderButtons = () => {
    if (isSuspended) {
      return (
        <button
          onClick={reactivate}
          disabled={loading}
          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "..." : "✓ Réactiver"}
        </button>
      );
    }

    return (
      <div className="flex flex-col gap-1.5 min-w-[150px]">
        {/* Approuver : visible sauf si déjà approuvé ou suspendu */}
        {vendorStatus !== "APPROVED" && !isSuspended && (
          <button
            onClick={approve}
            disabled={loading}
            className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "..." : "✓ Approuver"}
          </button>
        )}
        <button
          onClick={() => { setShowDocRequest(true); setShowReject(false); }}
          className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-orange-200"
        >
          📄 Demander docs
        </button>
        <button
          onClick={() => { setShowReject(true); setShowDocRequest(false); }}
          className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-200"
        >
          {vendorStatus === "APPROVED" ? "🚫 Suspendre" : "✗ Refuser"}
        </button>
      </div>
    );
  };

  return (
    <>
      {renderButtons()}

      {/* ── Modal Refus / Suspension ── */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-1">
              {vendorStatus === "APPROVED" ? "Suspendre la boutique" : "Motif de refus"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {vendorStatus === "APPROVED"
                ? "Le vendeur ne pourra plus accéder à son espace ni utiliser l'API."
                : "Le vendeur sera notifié avec ce motif."}
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                vendorStatus === "APPROVED"
                  ? "Motif de la suspension..."
                  : "Motif du refus..."
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4 resize-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button onClick={closeAll} className="text-gray-500 text-sm px-4 py-2">
                Annuler
              </button>
              <button
                onClick={vendorStatus === "APPROVED" ? confirmSuspend : confirmReject}
                disabled={loading || !reason.trim()}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? "..." : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Demande de documents ── */}
      {showDocRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-gray-800 mb-1">📄 Documents à demander</h3>
            <p className="text-sm text-gray-500 mb-4">
              Sélectionnez les documents. Les types déjà soumis sont grisés.
            </p>

            <div className="space-y-2 mb-5">
              {ALL_DOCUMENT_OPTIONS.map((opt) => {
                const alreadySubmitted = submittedDocTypes.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      alreadySubmitted
                        ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                        : selectedDocs.includes(opt.value)
                        ? "border-orange-400 bg-orange-50 cursor-pointer"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(opt.value)}
                      onChange={() => !alreadySubmitted && toggleDoc(opt.value)}
                      disabled={alreadySubmitted}
                      className="w-4 h-4 accent-orange-500 flex-shrink-0"
                    />
                    <span className="text-xl">{opt.icon}</span>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                      {alreadySubmitted && (
                        <span className="ml-2 text-xs text-gray-400">(déjà soumis)</span>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <label className="block text-xs text-gray-500 mb-1">
              Message additionnel (optionnel)
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Instructions supplémentaires pour le vendeur..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 mb-4 resize-none"
            />

            <div className="flex gap-3 justify-end">
              <button onClick={closeAll} className="text-gray-500 text-sm px-4 py-2">
                Annuler
              </button>
              <button
                onClick={requestDocuments}
                disabled={loading || selectedDocs.length === 0}
                className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? "..." : `Demander (${selectedDocs.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}