"use client";

import { Check, X, FileText, Ban } from "lucide-react";
import { useVendorActions }    from "@/hooks/useVendorActions";
import { VendorActionModals }  from "./VendorActionModals";

type Props = {
  vendorId:          string;
  vendorStatus:      string;
  isSuspended:       boolean;
  submittedDocTypes: string[];
};

export function VendorActions({ vendorId, vendorStatus, isSuspended, submittedDocTypes }: Props) {
  const {
    loading, modal, setModal, reason, setReason, selectedDocs,
    closeAll, approve, confirmReject, confirmSuspend, requestDocuments, toggleDoc,
  } = useVendorActions(vendorId);

  return (
    <>
      <div className="flex flex-col gap-1.5 min-w-35">
        {isSuspended ? (
          <button
            onClick={approve}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {loading ? "…" : "Réactiver"}
          </button>
        ) : (
          <>
            {vendorStatus !== "APPROVED" && (
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
              onClick={() => setModal("docs")}
              className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              Demander docs
            </button>
            <button
              onClick={() => setModal("reject")}
              className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
            >
              {vendorStatus === "APPROVED" ? (
                <Ban className="w-3.5 h-3.5" />
              ) : (
                <X className="w-3.5 h-3.5" />
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
