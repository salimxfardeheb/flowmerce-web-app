"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
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

type UploadedDoc = {
  type: string;
  name: string;
  url: string;
};

type UploadState = {
  progress: number;      // 0-100
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  requestedDocuments: string[];
  uploadedDocuments: UploadedDoc[];
};

export function DocumentUploadSection({ requestedDocuments, uploadedDocuments }: Props) {
  const router = useRouter();

  const [uploaded, setUploaded] = useState<Record<string, UploadedDoc>>(() => {
    const map: Record<string, UploadedDoc> = {};
    for (const doc of uploadedDocuments) {
      map[doc.type] = doc;
    }
    return map;
  });

  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});

  const setUploadState = (docType: string, patch: Partial<UploadState>) => {
    setUploadStates((prev) => ({
      ...prev,
      [docType]: { ...{ progress: 0, status: "idle" }, ...prev[docType], ...patch },
    }));
  };

  if (!requestedDocuments || requestedDocuments.length === 0) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-8">
        <p className="text-sm text-orange-700">
          Aucun document spécifique n&apos;a été précisé. Contactez le support pour plus d&apos;informations.
        </p>
      </div>
    );
  }

  const allUploaded = requestedDocuments.every((type) => !!uploaded[type]);

  const handleFileChange = (docType: string, file: File | null) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

    if (!allowedTypes.includes(file.type)) {
      setUploadState(docType, { status: "error", error: "Format non supporté. Utilisez PDF, JPG ou PNG." });
      return;
    }
    if (file.size > maxSize) {
      setUploadState(docType, { status: "error", error: "Fichier trop volumineux (max 5 Mo)." });
      return;
    }

    setUploadState(docType, { status: "uploading", progress: 0, error: undefined });

    const formData = new FormData();
    formData.append("documentType", docType);
    formData.append("file", file);

    // XHR pour suivre la progression réelle
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        // On considère que l'upload représente 90% du travail
        // Les 10% restants = traitement Cloudinary côté serveur
        const percent = Math.round((e.loaded / e.total) * 90);
        setUploadState(docType, { progress: percent });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setUploadState(docType, { status: "done", progress: 100 });
          setUploaded((prev) => ({
            ...prev,
            [docType]: { type: docType, name: file.name, url: data.url },
          }));
          router.refresh();
        } catch {
          setUploadState(docType, { status: "error", error: "Réponse invalide du serveur." });
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setUploadState(docType, { status: "error", error: data.error ?? "Erreur lors de l'upload." });
        } catch {
          setUploadState(docType, { status: "error", error: "Erreur lors de l'upload." });
        }
      }
    });

    xhr.addEventListener("error", () => {
      setUploadState(docType, { status: "error", error: "Erreur réseau. Réessayez." });
    });

    xhr.addEventListener("abort", () => {
      setUploadState(docType, { status: "idle", progress: 0 });
    });

    xhr.open("POST", "/api/vendors/documents");
    xhr.send(formData);
  };

  return (
    <div className="bg-white border border-orange-200 rounded-xl p-6 mb-8 shadow-sm">
      <h2 className="font-semibold text-gray-800 text-lg mb-1">
        📂 Documents requis
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        Soumettez chaque document demandé. Formats acceptés : PDF, JPG, PNG (max 5 Mo).
      </p>

      {/* Barre de progression globale */}
      {requestedDocuments.length > 1 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progression globale</span>
            <span>
              {Object.keys(uploaded).filter((t) => requestedDocuments.includes(t)).length} /{" "}
              {requestedDocuments.length} documents
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(
                  (Object.keys(uploaded).filter((t) => requestedDocuments.includes(t)).length /
                    requestedDocuments.length) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {allUploaded && (
        <div className="mb-5 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
          ✅ Tous les documents ont été soumis. Notre équipe les examinera dans les plus brefs délais.
        </div>
      )}

      <div className="space-y-4">
        {requestedDocuments.map((docType) => {
          const label = DOCUMENT_TYPE_LABELS[docType] ?? docType;
          const icon = DOCUMENT_ICONS[docType] ?? "📄";
          const isUploaded = !!uploaded[docType];
          const state = uploadStates[docType] ?? { status: "idle", progress: 0 };
          const isUploading = state.status === "uploading";

          return (
            <div
              key={docType}
              className={`rounded-xl border p-4 transition-all ${
                isUploaded
                  ? "border-green-200 bg-green-50"
                  : state.status === "error"
                  ? "border-red-200 bg-red-50"
                  : isUploading
                  ? "border-orange-200 bg-orange-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <p className="text-sm font-semibold text-gray-800">{label}</p>

                    {/* Badge statut */}
                    {isUploaded && !isUploading && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                        ✓ Soumis
                      </span>
                    )}
                    {!isUploaded && !isUploading && state.status !== "error" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        ⏳ En attente
                      </span>
                    )}
                    {isUploading && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 font-medium">
                        ⬆ Envoi en cours…
                      </span>
                    )}
                    {state.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                        ✗ Erreur
                      </span>
                    )}
                  </div>

                  {/* Fichier déjà soumis */}
                  {isUploaded && !isUploading && (
                    <p className="text-xs text-gray-500 truncate mb-2">
                      📎 {uploaded[docType].name}
                    </p>
                  )}

                  {/* Barre de progression individuelle */}
                  {isUploading && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-orange-600 mb-1">
                        <span>
                          {state.progress < 90
                            ? "Envoi vers le serveur…"
                            : "Traitement Cloudinary…"}
                        </span>
                        <span>{state.progress}%</span>
                      </div>
                      <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-200"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Message d'erreur */}
                  {state.status === "error" && state.error && (
                    <p className="text-xs text-red-600 mb-2">{state.error}</p>
                  )}

                  {/* Input fichier */}
                  <label
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      isUploading
                        ? "opacity-50 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200"
                        : isUploaded
                        ? "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        : "bg-orange-600 text-white border-transparent hover:bg-orange-700"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      disabled={isUploading}
                      className="sr-only"
                      onChange={(e) => handleFileChange(docType, e.target.files?.[0] ?? null)}
                    />
                    {isUploading ? (
                      <>
                        <SpinnerIcon />
                        Envoi en cours…
                      </>
                    ) : isUploaded ? (
                      "↩ Remplacer le fichier"
                    ) : (
                      "📎 Choisir un fichier"
                    )}
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="animate-spin h-3 w-3"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
