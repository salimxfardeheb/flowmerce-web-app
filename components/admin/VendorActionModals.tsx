"use client";

import { X, CreditCard, Building2, Receipt, Home } from "lucide-react";
import type { VendorModal } from "@/hooks/useVendorActions";

const DOCUMENT_OPTIONS = [
  {
    value: "ID_CARD",
    label: "Carte nationale d'identité (CNI) ou passeport",
    hint:  "Recto-verso obligatoire",
    icon:  CreditCard,
  },
  {
    value: "BUSINESS_REGISTRATION",
    label: "Registre du commerce",
    hint:  "RC — extrait original ou certifié conforme",
    icon:  Building2,
  },
  {
    value: "TAX_CERTIFICATE",
    label: "Numéro d'identification fiscale",
    hint:  "NIF — attestation délivrée par l'administration fiscale",
    icon:  Receipt,
  },
  {
    value: "ADDRESS_PROOF",
    label: "Justificatif de domicile",
    hint:  "Attestation de résidence ou facture eau / gaz / électricité (< 3 mois)",
    icon:  Home,
  },
];

interface Props {
  modal:              VendorModal;
  vendorStatus:       string;
  submittedDocTypes:  string[];
  loading:            boolean;
  reason:             string;
  selectedDocs:       string[];
  onClose:            () => void;
  onReasonChange:     (v: string) => void;
  onToggleDoc:        (v: string) => void;
  onConfirmReject:    () => void;
  onConfirmSuspend:   () => void;
  onRequestDocuments: () => void;
}

export function VendorActionModals({
  modal, vendorStatus, submittedDocTypes, loading, reason, selectedDocs,
  onClose, onReasonChange, onToggleDoc, onConfirmReject, onConfirmSuspend, onRequestDocuments,
}: Props) {
  const isSuspend = vendorStatus === "APPROVED";

  return (
    <>
      {/* ── Modal Refus / Suspension ── */}
      {modal === "reject" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {isSuspend ? "Suspendre la boutique" : "Motif de refus"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {isSuspend
                    ? "Le vendeur ne pourra plus accéder à son espace ni utiliser l'API."
                    : "Le vendeur sera notifié avec ce motif."}
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                placeholder={isSuspend ? "Motif de la suspension…" : "Motif du refus…"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none transition"
                autoFocus
              />
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={isSuspend ? onConfirmSuspend : onConfirmReject}
                disabled={loading || !reason.trim()}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Demande de documents ── */}
      {modal === "docs" && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Documents à demander</h3>
                <p className="text-xs text-gray-500 mt-0.5">Les types déjà soumis sont grisés.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="space-y-2">
                {DOCUMENT_OPTIONS.map((opt) => {
                  const alreadySubmitted = submittedDocTypes.includes(opt.value);
                  const isSelected       = selectedDocs.includes(opt.value);
                  const Icon             = opt.icon;
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
                        onChange={() => !alreadySubmitted && onToggleDoc(opt.value)}
                        disabled={alreadySubmitted}
                        className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0"
                      />
                      <div className={`flex items-center gap-2.5 min-w-0 flex-1 ${isSelected ? "opacity-100" : "opacity-80"}`}>
                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? "bg-indigo-100" : "bg-gray-100"}`}>
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
                  <span className="font-normal normal-case text-gray-400">— optionnel</span>
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  placeholder="Instructions supplémentaires pour le vendeur…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
                />
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                Annuler
              </button>
              <button
                onClick={onRequestDocuments}
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
