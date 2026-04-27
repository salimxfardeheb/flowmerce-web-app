"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, X, AlertCircle } from "lucide-react";

type Resolution = "Refund" | "Exchange" | "Repair" | "Reject";
type Shipping   = "Client" | "Vendeur" | "Shared";

type Props = {
  claimId:        string;
  aiDecision?:    string | null;
  aiScore?:       number | null;
  prediction?:    Record<string, unknown> | null;
  currentStatus?: string;
};

const RESOLUTION_OPTIONS: {
  value:    Resolution;
  label:    string;
  sublabel: string;
  dot:      string;
  cls:      string;
  clsActive: string;
}[] = [
  {
    value:     "Refund",
    label:     "Remboursement",
    sublabel:  "Client remboursé intégralement",
    dot:       "bg-green-500",
    cls:       "border-gray-200 hover:border-green-300 bg-white",
    clsActive: "border-green-400 bg-green-50 text-green-800",
  },
  {
    value:     "Exchange",
    label:     "Échange",
    sublabel:  "Remplacement du produit",
    dot:       "bg-blue-500",
    cls:       "border-gray-200 hover:border-blue-300 bg-white",
    clsActive: "border-blue-400 bg-blue-50 text-blue-800",
  },
  {
    value:     "Repair",
    label:     "Réparation",
    sublabel:  "Produit réparé et retourné",
    dot:       "bg-amber-400",
    cls:       "border-gray-200 hover:border-amber-300 bg-white",
    clsActive: "border-amber-400 bg-amber-50 text-amber-800",
  },
  {
    value:     "Reject",
    label:     "Refus",
    sublabel:  "Demande non acceptée",
    dot:       "bg-red-500",
    cls:       "border-gray-200 hover:border-red-300 bg-white",
    clsActive: "border-red-400 bg-red-50 text-red-800",
  },
];

const SHIPPING_OPTIONS: { value: Shipping; label: string }[] = [
  { value: "Client",  label: "À la charge du client"  },
  { value: "Vendeur", label: "À la charge du vendeur" },
  { value: "Shared",  label: "Partagé (50/50)"        },
];

const STATUS_OPTIONS = [
  { value: "APPROVED",    label: "Approuver",  cls: "bg-green-600 hover:bg-green-700 text-white"     },
  { value: "REJECTED",    label: "Rejeter",    cls: "bg-red-100 hover:bg-red-200 text-red-700"        },
  { value: "IN_PROGRESS", label: "En cours",   cls: "bg-blue-100 hover:bg-blue-200 text-blue-700"     },
];

export function ClaimActions({ claimId, aiDecision, aiScore, prediction, currentStatus }: Props) {
  const router = useRouter();

  const [open,         setOpen]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  // Champs du formulaire de modification ML
  const [resolution,   setResolution]   = useState<Resolution | "">((aiDecision as Resolution) ?? "");
  const [shipping,     setShipping]     = useState<Shipping | "">(
    (prediction as any)?.shipping_paid_by?.prediction ?? ""
  );
  const [rejectReason, setRejectReason] = useState("");   // obligatoire si Reject
  const [overrideNote, setOverrideNote] = useState("");   // optionnel pour les autres

  const isReject      = resolution === "Reject";
  const noteValue     = isReject ? rejectReason : overrideNote;
  const canSave       = !!resolution && (!isReject || rejectReason.trim().length >= 10);

  const confidence = aiScore != null ? Math.round(aiScore * 100) : null;
  const predAny    = prediction as any;
  const mlShipping = predAny?.shipping_paid_by?.prediction ?? predAny?.shipping?.responsible ?? null;

  // ── Boutons rapides de statut ────────────────────────────────────────────
  const quickStatus = async (status: string) => {
    setLoading(true);
    await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  };

  // ── Enregistrer la modification de décision ML ───────────────────────────
  const handleSave = async () => {
    setError("");

    if (!resolution) {
      setError("Veuillez sélectionner une résolution.");
      return;
    }
    if (isReject && rejectReason.trim().length < 10) {
      setError("La cause du refus est obligatoire (minimum 10 caractères).");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        aiDecision:       resolution,
        overrideShipping: shipping   || undefined,
        overrideNote:     isReject
          ? rejectReason.trim()
          : overrideNote.trim() || undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as any).error || "Erreur lors de l'enregistrement.");
      return;
    }

    setOpen(false);
    router.refresh();
  };

  const openModal = () => {
    // Pré-remplir avec la décision actuelle
    setResolution((aiDecision as Resolution) ?? "");
    setShipping(mlShipping ?? "");
    setRejectReason("");
    setOverrideNote("");
    setError("");
    setOpen(true);
  };

  return (
    <div className="flex flex-col gap-1.5">

      {/* Boutons rapides de statut */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTIONS.filter(s => s.value !== currentStatus).map(s => (
          <button
            key={s.value}
            onClick={() => quickStatus(s.value)}
            disabled={loading}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${s.cls}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Bouton modifier la décision ML */}
      <button
        onClick={openModal}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
      >
        <Brain className="w-3 h-3" />
        {aiDecision ? "Modifier la décision" : "Définir une décision"}
      </button>

      {/* ── Modal modification décision ML ──────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-900">Modifier la décision</h3>
                {aiDecision && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Décision ML actuelle :&nbsp;
                    <span className="font-medium text-indigo-700">{aiDecision}</span>
                    {confidence !== null && (
                      <span className="ml-1 text-gray-400">({confidence}% conf.)</span>
                    )}
                  </p>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ── Choix de la résolution ──────────────────────────────── */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Résolution *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => {
                    const isSelected = resolution === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setResolution(opt.value);
                          setError("");
                        }}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          isSelected ? opt.clsActive + " border-current" : opt.cls
                        }`}
                      >
                        <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`} />
                        <div>
                          <p className={`text-xs font-semibold leading-none ${isSelected ? "" : "text-gray-700"}`}>
                            {opt.label}
                          </p>
                          <p className={`text-xs mt-0.5 leading-tight ${isSelected ? "opacity-70" : "text-gray-400"}`}>
                            {opt.sublabel}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Note / Cause selon la résolution choisie ────────────── */}
              {resolution && (
                <div>
                  {isReject ? (
                    // Reject → champ obligatoire
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-red-700 mb-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Cause du refus
                        <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={3}
                        value={rejectReason}
                        onChange={e => { setRejectReason(e.target.value); setError(""); }}
                        placeholder="Expliquez au client la raison du refus… (ex : délai dépassé, produit non éligible, usage constaté…)"
                        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${
                          error && rejectReason.trim().length < 10
                            ? "border-red-300 focus:ring-red-400 bg-red-50"
                            : "border-gray-300 focus:ring-indigo-500"
                        }`}
                      />
                      <p className={`text-xs mt-1 ${
                        rejectReason.trim().length >= 10 ? "text-gray-400" : "text-red-500"
                      }`}>
                        {rejectReason.trim().length}/10 caractères minimum
                      </p>
                    </div>
                  ) : (
                    // Refund / Exchange / Repair → note optionnelle
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        Note de justification
                        <span className="ml-1 text-xs font-normal text-gray-400">(optionnel)</span>
                      </label>
                      <textarea
                        rows={2}
                        value={overrideNote}
                        onChange={e => setOverrideNote(e.target.value)}
                        placeholder="Expliquez pourquoi vous modifiez la décision ML…"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Frais de retour ─────────────────────────────────────── */}
              {resolution && resolution !== "Reject" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Frais de retour
                    {mlShipping && (
                      <span className="ml-2 text-xs text-gray-400 font-normal">(ML : {mlShipping})</span>
                    )}
                  </label>
                  <select
                    value={shipping}
                    onChange={e => setShipping(e.target.value as Shipping)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Garder la décision ML —</option>
                    {SHIPPING_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Erreur globale */}
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2.5 rounded-xl">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !canSave}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
