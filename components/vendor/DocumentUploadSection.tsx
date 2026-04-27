"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard, Building2, Home, Receipt, Paperclip,
  CheckCircle2, Clock, AlertCircle, Upload, RotateCcw,
  Loader2, Eye, Minimize2, X, Send,
} from "lucide-react";

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  ID_CARD:               "Carte nationale d'identité (CNI) ou passeport",
  BUSINESS_REGISTRATION: "Registre du commerce (RC)",
  ADDRESS_PROOF:         "Justificatif de domicile",
  TAX_CERTIFICATE:       "Numéro d'identification fiscale (NIF)",
  OTHER:                 "Autre document",
};

const DOCUMENT_TYPE_HINTS: Record<string, string> = {
  ID_CARD:               "Recto-verso obligatoire",
  BUSINESS_REGISTRATION: "Extrait original ou certifié conforme",
  ADDRESS_PROOF:         "Attestation de résidence ou facture eau / gaz / électricité (< 3 mois)",
  TAX_CERTIFICATE:       "Attestation délivrée par l'administration fiscale",
};

const DOCUMENT_TYPE_ICONS: Record<string, React.ElementType> = {
  ID_CARD:               CreditCard,
  BUSINESS_REGISTRATION: Building2,
  ADDRESS_PROOF:         Home,
  TAX_CERTIFICATE:       Receipt,
  OTHER:                 Paperclip,
};

const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf"];

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

      let quality = 0.82;

      const tryCompress = () => {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Compression échouée")); return; }
          if (blob.size <= MAX_SIZE_BYTES || quality <= 0.25) {
            const outName = file.name.replace(/\.[^.]+$/, ".jpg");
            resolve(new File([blob], outName, { type: "image/jpeg", lastModified: Date.now() }));
          } else {
            quality = Math.round((quality - 0.1) * 100) / 100;
            tryCompress();
          }
        }, "image/jpeg", quality);
      };

      tryCompress();
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Image illisible")); };
    img.src = objectUrl;
  });
}

type UploadedDoc = {
  type: string;
  name: string;
  url:  string;
};

type UploadStatus = "idle" | "compressing" | "uploading" | "done" | "error" | "pending";

type UploadState = {
  progress: number;
  status:   UploadStatus;
  error?:   string;
  compressed?: boolean;
};

type PendingFile = {
  file:       File;
  previewUrl: string;
  compressed: boolean;
};

type Props = {
  requestedDocuments: string[];
  uploadedDocuments:  UploadedDoc[];
};

export function DocumentUploadSection({ requestedDocuments, uploadedDocuments }: Props) {
  const router = useRouter();

  const [uploaded, setUploaded] = useState<Record<string, UploadedDoc>>(() => {
    const map: Record<string, UploadedDoc> = {};
    for (const doc of uploadedDocuments) map[doc.type] = doc;
    return map;
  });
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingFile>>({});

  const setUploadState = (docType: string, patch: Partial<UploadState>) =>
    setUploadStates((prev) => ({
      ...prev,
      [docType]: { ...{ progress: 0, status: "idle" as const }, ...prev[docType], ...patch },
    }));

  if (!requestedDocuments || requestedDocuments.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
        <p className="text-sm text-amber-700">
          Aucun document spécifique n&apos;a été précisé. Contactez le support pour plus d&apos;informations.
        </p>
      </div>
    );
  }

  const allUploaded   = requestedDocuments.every((type) => !!uploaded[type]);
  const uploadedCount = Object.keys(uploaded).filter((t) => requestedDocuments.includes(t)).length;

  // Phase 1 — validate, compress, then park in pendingFiles for review
  const handleFileChange = async (docType: string, file: File | null) => {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadState(docType, { status: "error", error: "Format non supporté. Utilisez PDF, JPG ou PNG." });
      return;
    }

    let fileToSend = file;
    let wasCompressed = false;

    if (IMAGE_TYPES.includes(file.type)) {
      setUploadState(docType, { status: "compressing", progress: 0, error: undefined });
      try {
        const compressed = await compressImage(file);
        wasCompressed = compressed.size < file.size;
        fileToSend = compressed;
      } catch {
        setUploadState(docType, { status: "error", error: "Impossible de traiter l'image. Réessayez." });
        return;
      }
    } else if (file.size > MAX_SIZE_BYTES) {
      setUploadState(docType, { status: "error", error: `Fichier PDF trop volumineux (max ${MAX_SIZE_MB} Mo).` });
      return;
    }

    // Revoke any previous pending object URL before replacing
    setPendingFiles((prev) => {
      if (prev[docType]) URL.revokeObjectURL(prev[docType].previewUrl);
      return {
        ...prev,
        [docType]: {
          file:       fileToSend,
          previewUrl: URL.createObjectURL(fileToSend),
          compressed: wasCompressed,
        },
      };
    });
    setUploadState(docType, { status: "pending", progress: 0, error: undefined, compressed: wasCompressed });
  };

  // Phase 2 — user confirmed, now upload
  const handleConfirmUpload = (docType: string) => {
    const pending = pendingFiles[docType];
    if (!pending) return;

    setUploadState(docType, { status: "uploading", progress: 0, error: undefined });

    const formData = new FormData();
    formData.append("documentType", docType);
    formData.append("file", pending.file);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable)
        setUploadState(docType, { progress: Math.round((e.loaded / e.total) * 90) });
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setUploadState(docType, { status: "done", progress: 100, compressed: pending.compressed });
          setUploaded((prev) => ({
            ...prev,
            [docType]: { type: docType, name: pending.file.name, url: data.url },
          }));
          setPendingFiles((prev) => {
            URL.revokeObjectURL(pending.previewUrl);
            const next = { ...prev };
            delete next[docType];
            return next;
          });
          router.refresh();
        } catch {
          setUploadState(docType, { status: "error", error: "Réponse invalide du serveur." });
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setUploadState(docType, { status: "error", error: data.error ?? "Erreur lors de l'envoi." });
        } catch {
          setUploadState(docType, { status: "error", error: "Erreur lors de l'envoi." });
        }
      }
    });
    xhr.addEventListener("error", () => setUploadState(docType, { status: "error", error: "Erreur réseau. Réessayez." }));
    xhr.addEventListener("abort",  () => setUploadState(docType, { status: "pending", progress: 0 }));
    xhr.open("POST", "/api/vendors/documents");
    xhr.send(formData);
  };

  const handleCancelPending = (docType: string) => {
    setPendingFiles((prev) => {
      if (prev[docType]) URL.revokeObjectURL(prev[docType].previewUrl);
      const next = { ...prev };
      delete next[docType];
      return next;
    });
    setUploadState(docType, { status: "idle", progress: 0, error: undefined });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
      <h2 className="text-sm font-semibold text-gray-900 mb-0.5">Documents requis</h2>
      <p className="text-xs text-gray-500 mb-5">
        Formats acceptés : PDF, JPG, PNG · max {MAX_SIZE_MB} Mo · les images sont compressées automatiquement.
      </p>

      {requestedDocuments.length > 1 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Progression</span>
            <span>{uploadedCount} / {requestedDocuments.length} documents</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((uploadedCount / requestedDocuments.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {allUploaded && (
        <div className="mb-5 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700 font-medium">
            Tous les documents ont été soumis. Notre équipe les examinera dans les plus brefs délais.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {requestedDocuments.map((docType) => {
          const label         = DOCUMENT_TYPE_LABELS[docType] ?? docType;
          const hint          = DOCUMENT_TYPE_HINTS[docType];
          const TypeIcon      = DOCUMENT_TYPE_ICONS[docType] ?? Paperclip;
          const isUploaded    = !!uploaded[docType];
          const state         = uploadStates[docType] ?? { status: "idle", progress: 0 };
          const pending       = pendingFiles[docType] ?? null;
          const isCompressing = state.status === "compressing";
          const isUploading   = state.status === "uploading";
          const isPending     = state.status === "pending";
          const isBusy        = isCompressing || isUploading;

          return (
            <div
              key={docType}
              className={`rounded-xl border p-4 transition-all ${
                isUploaded               ? "border-green-200 bg-green-50/40"
                : state.status === "error" ? "border-red-200 bg-red-50/40"
                : isPending              ? "border-indigo-200 bg-indigo-50/40"
                : isBusy                 ? "border-amber-200 bg-amber-50/40"
                :                          "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icône type */}
                <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                  isUploaded ? "bg-green-100 border-green-200"
                  : isPending ? "bg-indigo-100 border-indigo-200"
                  : "bg-white border-gray-200"
                }`}>
                  <TypeIcon className={`w-4 h-4 ${
                    isUploaded ? "text-green-600"
                    : isPending ? "text-indigo-600"
                    : "text-gray-500"
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Titre + badge statut */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-0.5">
                    <p className="text-sm font-medium text-gray-900">{label}</p>

                    {isUploaded && !isBusy && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Soumis
                      </span>
                    )}
                    {!isUploaded && !isBusy && !isPending && state.status !== "error" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                        <Clock className="w-3 h-3" /> En attente
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium">
                        <Eye className="w-3 h-3" /> Prêt à envoyer
                      </span>
                    )}
                    {isCompressing && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 font-medium">
                        <Minimize2 className="w-3 h-3 animate-pulse" /> Compression…
                      </span>
                    )}
                    {isUploading && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                        <Loader2 className="w-3 h-3 animate-spin" /> Envoi…
                      </span>
                    )}
                    {state.status === "error" && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium">
                        <AlertCircle className="w-3 h-3" /> Erreur
                      </span>
                    )}
                  </div>

                  {/* Hint */}
                  {hint && (
                    <p className="text-xs text-gray-400 mb-2">{hint}</p>
                  )}

                  {/* Aperçu du fichier en attente de confirmation */}
                  {isPending && pending && (
                    <div className="flex items-center gap-2 mb-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                      <Paperclip className="w-3 h-3 shrink-0" />
                      <span className="truncate font-medium">{pending.file.name}</span>
                      <span className="shrink-0 text-indigo-400">·</span>
                      <span className="shrink-0">{formatSize(pending.file.size)}</span>
                      {pending.compressed && (
                        <span className="shrink-0 text-violet-600 font-medium">· compressé</span>
                      )}
                    </div>
                  )}

                  {/* Nom du fichier soumis */}
                  {isUploaded && !isBusy && (
                    <p className="text-xs text-gray-500 truncate mb-2">
                      {uploaded[docType].name}
                      {state.compressed && (
                        <span className="ml-2 text-violet-500 font-medium">· compressé</span>
                      )}
                    </p>
                  )}

                  {/* Barre de progression compression */}
                  {isCompressing && (
                    <div className="mb-2">
                      <p className="text-xs text-violet-600 mb-1">Optimisation de l&apos;image en cours…</p>
                      <div className="h-1 bg-violet-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full animate-pulse w-1/2" />
                      </div>
                    </div>
                  )}

                  {/* Barre de progression upload */}
                  {isUploading && (
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-amber-600 mb-1">
                        <span>{state.progress < 90 ? "Envoi vers le serveur…" : "Traitement…"}</span>
                        <span>{state.progress}%</span>
                      </div>
                      <div className="h-1 bg-amber-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-200"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Erreur */}
                  {state.status === "error" && state.error && (
                    <p className="text-xs text-red-600 mb-2">{state.error}</p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-wrap">

                    {/* Document soumis — voir sur le serveur */}
                    {isUploaded && !isBusy && !isPending && (
                      <a
                        href={uploaded[docType].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        Voir le document
                      </a>
                    )}

                    {/* Fichier en attente — aperçu local, confirmer, annuler */}
                    {isPending && pending && (
                      <>
                        <a
                          href={pending.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Voir le document
                        </a>
                        <button
                          type="button"
                          onClick={() => handleConfirmUpload(docType)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-indigo-600 text-white border-transparent hover:bg-indigo-700 transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          Confirmer l&apos;envoi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelPending(docType)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-500 border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Annuler
                        </button>
                      </>
                    )}

                    {/* Upload / Remplacer (toujours accessible sauf pendant compressing/uploading) */}
                    {!isPending && (
                      <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        isBusy
                          ? "opacity-50 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200"
                          : isUploaded
                          ? "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                          : "bg-indigo-600 text-white border-transparent hover:bg-indigo-700"
                      }`}>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          disabled={isBusy}
                          className="sr-only"
                          onChange={(e) => handleFileChange(docType, e.target.files?.[0] ?? null)}
                        />
                        {isCompressing ? (
                          <><Minimize2 className="w-3 h-3 animate-pulse" /> Compression…</>
                        ) : isUploading ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Envoi en cours…</>
                        ) : isUploaded ? (
                          <><RotateCcw className="w-3 h-3" /> Remplacer</>
                        ) : (
                          <><Upload className="w-3 h-3" /> Choisir un fichier</>
                        )}
                      </label>
                    )}

                    {/* Changer le fichier pendant la phase de confirmation */}
                    {isPending && (
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-gray-500 border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="sr-only"
                          onChange={(e) => handleFileChange(docType, e.target.files?.[0] ?? null)}
                        />
                        <RotateCcw className="w-3 h-3" /> Changer
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
