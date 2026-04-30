"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VendorModal = "reject" | "docs" | null;

export function useVendorActions(vendorId: string) {
  const router = useRouter();
  const [loading,      setLoading]      = useState(false);
  const [modal,        setModal]        = useState<VendorModal>(null);
  const [reason,       setReason]       = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

  const closeAll = () => {
    setModal(null);
    setReason("");
    setSelectedDocs([]);
  };

  const callApi = async (body: object) => {
    setLoading(true);
    await fetch(`/api/vendors/${vendorId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    setLoading(false);
  };

  const approve = async () => {
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
      status:              "DOCUMENTS_REQUESTED",
      rejectionReason:     reason || null,
      requestedDocuments:  selectedDocs,
    });
    closeAll();
    router.refresh();
  };

  const toggleDoc = (value: string) =>
    setSelectedDocs((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );

  return {
    loading,
    modal,
    setModal,
    reason,
    setReason,
    selectedDocs,
    closeAll,
    approve,
    confirmReject,
    confirmSuspend,
    requestDocuments,
    toggleDoc,
  };
}
