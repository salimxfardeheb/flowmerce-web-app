"use client";

import { Check, X, FileText, Ban } from "lucide-react";
import { useVendorActions }   from "@/hooks/useVendorActions";
import { VendorActionModals } from "./VendorActionModals";

type Props = {
  vendorId:             string;
  isSuspended:          boolean;
  vendorStatus:         string;
  notYetSubmittedTypes: string[];
};

export function VendorDetailActions({ vendorId, isSuspended, vendorStatus, notYetSubmittedTypes }: Props) {
  const {
    loading, modal, setModal, reason, setReason, selectedDocs,
    closeAll, approve, confirmReject, confirmSuspend, requestDocuments, toggleDoc,
  } = useVendorActions(vendorId);

  // Inverse: the modal expects already-submitted types
  const submittedDocTypes = notYetSubmittedTypes.length === 0
    ? []
    : ["ID_CARD", "BUSINESS_REGISTRATION", "TAX_CERTIFICATE", "ADDRESS_PROOF"].filter(
        (v) => !notYetSubmittedTypes.includes(v)
      );

  return (
    <>
      <div className="flex gap-2 flex-wrap justify-end">
        {isSuspended ? (
          <button
            onClick={approve}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Check className="w-4 h-4" />
            {loading ? "…" : "Réactiver"}
          </button>
        ) : (
          <>
            {vendorStatus !== "APPROVED" && (
              <button
                onClick={approve}
                disabled={loading}
                className="inline-flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Check className="w-4 h-4" />
                {loading ? "…" : "Approuver"}
              </button>
            )}
            <button
              onClick={() => setModal("docs")}
              className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Demander docs
            </button>
            <button
              onClick={() => setModal("reject")}
              className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
            >
              {vendorStatus === "APPROVED" ? (
                <Ban className="w-4 h-4" />
              ) : (
                <X className="w-4 h-4" />
              )}
              {vendorStatus === "APPROVED" ? "Suspendre" : "Refuser"}
            </button>
          </>
        )}
      </div>

      <VendorActionModals
        modal={modal}
        vendorStatus={vendorStatus}
        submittedDocTypes={submittedDocTypes}
        loading={loading}
        reason={reason}
        selectedDocs={selectedDocs}
        onClose={closeAll}
        onReasonChange={setReason}
        onToggleDoc={toggleDoc}
        onConfirmReject={confirmReject}
        onConfirmSuspend={confirmSuspend}
        onRequestDocuments={requestDocuments}
      />
    </>
  );
}
