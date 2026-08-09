"use client";

// components/claims/ClaimActions.tsx — Flowmerce
//
// Action unique sur une réclamation : « Approuver » ouvre une modale où le
// vendeur choisit la décision effective avant envoi au client.
//
// Le vendeur tranche parmi 4 décisions — les 3 classes ML + Remboursement.
// Le ML ne peut jamais recommander un remboursement (contrat 3 classes), mais
// le client peut l'avoir demandé (claim.type = REFUND) : sans cette option, sa
// demande ne pouvait jamais être validée telle quelle.
//
// Le statut découle de la décision :
//   Exchange / Repair / Refund → APPROVED
//   Reject                     → REJECTED

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle, AlertTriangle } from "lucide-react";
import { VENDOR_DECISION_LABELS, type VendorDecision } from "@/lib/constants";

type Props = {
  claimId:        string;
  aiDecision?:    string | null;
  aiScore?:       number | null;
  currentStatus?: string;
  /** Résolution demandée par le client (enum Prisma ClaimType). */
  claimType?:     "EXCHANGE" | "REFUND" | "REPAIR" | null;
};

const RESOLUTION_OPTIONS: {
  value: VendorDecision; dot: string; cls: string
}[] = [
  { value: "Exchange", dot: "bg-blue-500",    cls: "border-blue-300 bg-blue-50 text-blue-800"          },
  { value: "Repair",   dot: "bg-amber-400",   cls: "border-amber-300 bg-amber-50 text-amber-800"       },
  { value: "Refund",   dot: "bg-emerald-500", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
  { value: "Reject",   dot: "bg-red-500",     cls: "border-red-300 bg-red-50 text-red-800"             },
];

// Résolution demandée par le client → décision équivalente côté vendeur.
const TYPE_TO_DECISION: Record<string, VendorDecision> = {
  EXCHANGE: "Exchange",
  REFUND:   "Refund",
  REPAIR:   "Repair",
};

export function ClaimActions({ claimId, aiDecision, aiScore, currentStatus, claimType }: Props) {
  const router = useRouter();

  const requested = claimType ? TYPE_TO_DECISION[claimType] ?? null : null;

  // Pré-sélection : la reco ML si elle existe, sinon la demande du client.
  const defaultResolution = (): VendorDecision | "" =>
    (aiDecision as VendorDecision) || requested || "";

  const [loading,    setLoading]    = useState(false);
  const [open,       setOpen]       = useState(false);
  const [resolution, setResolution] = useState<VendorDecision | "">(defaultResolution());
  const [note,       setNote]       = useState("");
  const [error,      setError]      = useState<string | null>(null);

  const confidence = aiScore != null ? Math.round(aiScore * 100) : null;
  const canAct     = currentStatus !== "APPROVED" && currentStatus !== "REJECTED";

  // Le ML a recommandé autre chose que ce que le client demande.
  const diverges = !!aiDecision && !!requested && aiDecision !== requested;

  const submit = async (status: "APPROVED" | "REJECTED" | "IN_PROGRESS") => {
    if (status !== "IN_PROGRESS" && !resolution) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(status !== "IN_PROGRESS" ? { aiDecision: resolution } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    }).catch(() => null);

    setLoading(false);

    if (!res?.ok) {
      const detail = await res?.json().catch(() => null);
      setError(detail?.error ?? "L'enregistrement a échoué. Réessayez.");
      return;
    }

    setOpen(false);
    setNote("");
    router.refresh();
  };

  if (!canAct) {
    return <span className="text-xs text-gray-300 italic">Traitée</span>;
  }

  // Un refus reste un refus : le bouton de confirmation change de libellé et de
  // couleur pour que l'action envoyée soit sans ambiguïté.
  const isReject = resolution === "Reject";

  return (
    <>
      <button
        onClick={() => { setResolution(defaultResolution()); setNote(""); setError(null); setOpen(true); }}
        disabled={loading}
        className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 bg-green-600 hover:bg-green-700 text-white flex items-center gap-1 w-fit"
      >
        <CheckCircle className="w-3 h-3" />
        Approuver
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Traiter la réclamation</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Choisissez la décision à appliquer et à notifier au client.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Demande client vs recommandation ML */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Demande client</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">
                    {requested ? VENDOR_DECISION_LABELS[requested] : "—"}
                  </p>
                </div>
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Reco. IA</p>
                  <p className="text-sm font-semibold text-indigo-800 mt-0.5">
                    {aiDecision
                      ? VENDOR_DECISION_LABELS[aiDecision as VendorDecision] ?? aiDecision
                      : "Non analysée"}
                    {confidence !== null && (
                      <span className="ml-1.5 text-xs font-normal text-indigo-400">{confidence}%</span>
                    )}
                  </p>
                </div>
              </div>

              {diverges && (
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    L&apos;IA ne recommande pas ce que le client demande. Votre choix ci-dessous
                    fait foi et sera enregistré comme décision manuelle.
                  </span>
                </div>
              )}

              {/* Sélecteur de décision */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Décision à appliquer <span className="text-red-400 font-normal normal-case">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        resolution === opt.value
                          ? opt.cls + " border-current"
                          : "border-gray-200 hover:border-gray-300 bg-gray-50 text-gray-500"
                      }`}
                    >
                      <input
                        type="radio"
                        name="resolution"
                        value={opt.value}
                        checked={resolution === opt.value}
                        onChange={() => setResolution(opt.value)}
                        className="sr-only"
                      />
                      <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                      <span className="text-xs font-medium">{VENDOR_DECISION_LABELS[opt.value]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Note <span className="font-normal normal-case text-gray-400">— optionnel</span>
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Commentaire visible dans la notification client…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => submit(isReject ? "REJECTED" : "APPROVED")}
                  disabled={loading || !resolution}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${
                    isReject ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {loading
                    ? "Envoi…"
                    : isReject
                      ? "Refuser & notifier le client"
                      : "Valider & notifier le client"}
                </button>
              </div>

              {/* Seul accès restant à IN_PROGRESS depuis que la carte n'expose
                  plus qu'un bouton. */}
              {currentStatus !== "IN_PROGRESS" && (
                <button
                  onClick={() => submit("IN_PROGRESS")}
                  disabled={loading}
                  className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 transition-colors disabled:opacity-50"
                >
                  Marquer « en cours » sans décider
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
