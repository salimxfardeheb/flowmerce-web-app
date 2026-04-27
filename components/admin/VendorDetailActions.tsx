"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, FileText, Ban } from "lucide-react";

const ALL_DOCUMENT_OPTIONS = [
  { value: "ID_CARD",               label: "Carte d'identité nationale" },
  { value: "BUSINESS_REGISTRATION", label: "Registre du commerce"       },
  { value: "ADDRESS_PROOF",         label: "Justificatif de domicile"   },
  { value: "TAX_CERTIFICATE",       label: "Attestation fiscale"        },
  { value: "OTHER",                 label: "Autre document"             },
];

type Props = {
  vendorId:             string;
  isSuspended:          boolean;
  vendorStatus:         string;
  notYetSubmittedTypes: string[];
};

export function VendorDetailActions({ vendorId, isSuspended, vendorStatus, notYetSubmittedTypes }: Props) {
  const router = useRouter();
  const [loading,        setLoading]        = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [showDocRequest, setShowDocRequest] = useState(false);
  const [reason,         setReason]         = useState("");
  const [selectedDocs,   setSelectedDocs]   = useState<string[]>([]);

  const closeAll = () => {
    setShowConfirm(false);
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

  const suspend    = async () => { if (!reason.trim()) return; await callApi({ status: "REJECTED", rejectionReason: `[SUSPENDU] ${reason}` }); closeAll(); router.refresh(); };
  const reactivate = async () => { await callApi({ status: "APPROVED", rejectionReason: null }); router.refresh(); };
  const approve    = async () => { await callApi({ status: "APPROVED", rejectionReason: null }); router.refresh(); };
  const reject     = async () => { if (!reason.trim()) return; await callApi({ status: "REJECTED", rejectionReason: reason }); closeAll(); router.refresh(); };

  const requestDocuments = async () => {
    if (selectedDocs.length === 0) return;
    await callApi({ status: "DOCUMENTS_REQUESTED", rejectionReason: reason || null, requestedDocuments: selectedDocs });
    closeAll();
    router.refresh();
  };

  const toggleDoc = (value: string) =>
    setSelectedDocs((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);

  return (
    <>
      <div className="flex gap-2 flex-wrap justify-end">
        {isSuspended ? (
          <button onClick={reactivate} disabled={loading} className="inline-flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            <Check className="w-4 h-4" />
            {loading ? "…" : "Réactiver"}
          </button>
        ) : (
          <>
            {vendorStatus !== "APPROVED" && (
              <button onClick={approve} disabled={loading} className="inline-flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                <Check className="w-4 h-4" />
                {loading ? "…" : "Approuver"}
              </button>
            )}
            <button onClick={() => { setShowDocRequest(true); setShowConfirm(false); }} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors">
              <FileText className="w-4 h-4" />
              Demander docs
            </button>
            <button onClick={() => { setShowConfirm(true); setShowDocRequest(false); }} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
              <Ban className="w-4 h-4" />
              Suspendre
            </button>
          </>
        )}
      </div>

      {/* Modal Suspension */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Suspendre la boutique</h3>
                <p className="text-xs text-gray-500 mt-0.5">Le vendeur ne pourra plus accéder à son espace ni utiliser l&apos;API.</p>
              </div>
              <button onClick={closeAll} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motif de la suspension…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none transition"
                autoFocus
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={closeAll} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Annuler</button>
              <button onClick={suspend} disabled={loading || !reason.trim()} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
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
                <h3 className="text-sm font-semibold text-gray-900">Demander des documents</h3>
                <p className="text-xs text-gray-500 mt-0.5">Seuls les documents non encore soumis sont proposés.</p>
              </div>
              <button onClick={closeAll} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="space-y-1.5">
                {ALL_DOCUMENT_OPTIONS.map((opt) => {
                  const alreadySubmitted = !notYetSubmittedTypes.includes(opt.value) &&
                    notYetSubmittedTypes.length !== ALL_DOCUMENT_OPTIONS.length;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                        alreadySubmitted
                          ? "border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed"
                          : selectedDocs.includes(opt.value)
                          ? "border-indigo-400 bg-indigo-50 cursor-pointer"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.includes(opt.value)}
                        onChange={() => !alreadySubmitted && toggleDoc(opt.value)}
                        disabled={alreadySubmitted}
                        className="w-4 h-4 accent-indigo-600 shrink-0"
                      />
                      <span className={`text-sm font-medium ${selectedDocs.includes(opt.value) ? "text-indigo-800" : "text-gray-700"}`}>
                        {opt.label}
                      </span>
                      {alreadySubmitted && <span className="ml-auto text-xs text-gray-400">Déjà soumis</span>}
                    </label>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  Message additionnel <span className="font-normal normal-case text-gray-400">— optionnel</span>
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Instructions supplémentaires…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button onClick={closeAll} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Annuler</button>
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
