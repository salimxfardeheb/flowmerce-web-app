"use client";

// components/claims/ClaimActions.tsx — Flowmerce
//
// Boutons d'action sur une réclamation.
// Approuver → ouvre une modale pour confirmer (et modifier) la décision ML avant envoi.
// Rejeter / En cours → action directe sans modale.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, X, CheckCircle } from "lucide-react";
import type { AIDecision } from "@/lib/constants";

type Resolution = AIDecision;

type Props = {
  claimId:        string;
  aiDecision?:    string | null;
  aiScore?:       number | null;
  currentStatus?: string;
};

const RESOLUTION_OPTIONS: {
  value: Resolution; label: string; emoji: string; dot: string; cls: string
}[] = [
  { value: "Refund",   label: "Remboursement", emoji: "💰", dot: "bg-green-500", cls: "border-green-300 bg-green-50 text-green-800"  },
  { value: "Exchange", label: "Échange",        emoji: "🔄", dot: "bg-blue-500",  cls: "border-blue-300 bg-blue-50 text-blue-800"    },
  { value: "Repair",   label: "Réparation",     emoji: "🔧", dot: "bg-amber-400", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  { value: "Reject",   label: "Refus",           emoji: "❌", dot: "bg-red-500",   cls: "border-red-300 bg-red-50 text-red-800"       },
];

export function ClaimActions({ claimId, aiDecision, aiScore, currentStatus }: Props) {
  const router = useRouter();

  const [loading,      setLoading]      = useState(false);
  const [openApprove,  setOpenApprove]  = useState(false);   // modale approbation
  const [openDecision, setOpenDecision] = useState(false);   // modale modification seule
  const [resolution,   setResolution]   = useState<Resolution | "">((aiDecision as Resolution) ?? "");
  const [note,         setNote]         = useState("");

  const confidence = aiScore != null ? Math.round(aiScore * 100) : null;
  const canAct     = currentStatus !== "APPROVED" && currentStatus !== "REJECTED";

  // ── Action rapide (Rejeter / En cours) — sans décision ──────────────────
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

  // ── Approbation avec décision ────────────────────────────────────────────
  const handleApprove = async () => {
    if (!resolution) return;
    setLoading(true);
    const res = await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status:      "APPROVED",
        aiDecision:  resolution,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    });
    setLoading(false);
    if (!res.ok) return;
    setOpenApprove(false);
    setNote("");
    router.refresh();
  };

  // ── Modification décision seule (sans changer le statut) ─────────────────
  const handleSaveDecision = async () => {
    if (!resolution) return;
    setLoading(true);
    const res = await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiDecision:   resolution,
        ...(note.trim() ? { overrideNote: note.trim() } : {}),
      }),
    });
    setLoading(false);
    if (!res.ok) return;
    setOpenDecision(false);
    setNote("");
    router.refresh();
  };

  if (!canAct) {
    return <span className="text-xs text-gray-300 italic">Traitée</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">

      {/* ── Boutons d'action ── */}
      <div className="flex gap-1.5 flex-wrap">

        {/* Approuver → ouvre la modale avec sélecteur de décision */}
        {currentStatus !== "APPROVED" && (
          <button
            onClick={() => { setResolution((aiDecision as Resolution) ?? ""); setNote(""); setOpenApprove(true); }}
            disabled={loading}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
          >
            <CheckCircle className="w-3 h-3" />
            Approuver
          </button>
        )}

        {/* En cours */}
        {currentStatus !== "IN_PROGRESS" && (
          <button
            onClick={() => quickStatus("IN_PROGRESS")}
            disabled={loading}
            className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 bg-blue-100 hover:bg-blue-200 text-blue-700"
          >
            En cours
          </button>
        )}

        {/* Rejeter */}
        <button
          onClick={() => quickStatus("REJECTED")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 bg-red-100 hover:bg-red-200 text-red-700"
        >
          Rejeter
        </button>
      </div>

      {/* Modifier la décision sans changer le statut */}
      {aiDecision && (
        <button
          onClick={() => { setResolution((aiDecision as Resolution) ?? ""); setNote(""); setOpenDecision(true); }}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200 w-fit"
        >
          <Brain className="w-3 h-3" />
          Modifier la décision
        </button>
      )}

      {/* ══ Modale — Approuver avec décision ══════════════════════════════════ */}
      {openApprove && (
        <DecisionModal
          title="Approuver la réclamation"
          subtitle="Confirmez ou modifiez la décision ML avant envoi au client."
          confirmLabel={loading ? "Envoi…" : "✅ Approuver & notifier le client"}
          confirmCls="bg-green-600 hover:bg-green-700 text-white"
          aiDecision={aiDecision}
          confidence={confidence}
          resolution={resolution}
          note={note}
          loading={loading}
          onResolution={setResolution}
          onNote={setNote}
          onConfirm={handleApprove}
          onClose={() => setOpenApprove(false)}
        />
      )}

      {/* ══ Modale — Modifier décision seule ═════════════════════════════════ */}
      {openDecision && (
        <DecisionModal
          title="Révision de la décision"
          subtitle="Modifiez la décision ML sans changer le statut."
          confirmLabel={loading ? "Enregistrement…" : "Confirmer"}
          confirmCls="bg-indigo-600 hover:bg-indigo-700 text-white"
          aiDecision={aiDecision}
          confidence={confidence}
          resolution={resolution}
          note={note}
          loading={loading}
          onResolution={setResolution}
          onNote={setNote}
          onConfirm={handleSaveDecision}
          onClose={() => setOpenDecision(false)}
        />
      )}
    </div>
  );
}

// ── Modale partagée ────────────────────────────────────────────────────────────

function DecisionModal({
  title, subtitle, confirmLabel, confirmCls,
  aiDecision, confidence,
  resolution, note, loading,
  onResolution, onNote, onConfirm, onClose,
}: {
  title:         string
  subtitle:      string
  confirmLabel:  string
  confirmCls:    string
  aiDecision?:   string | null
  confidence:    number | null
  resolution:    Resolution | ""
  note:          string
  loading:       boolean
  onResolution:  (r: Resolution) => void
  onNote:        (n: string) => void
  onConfirm:     () => void
  onClose:       () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* Décision ML actuelle */}
          {aiDecision && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Décision ML</p>
                <p className="text-sm font-semibold text-indigo-800 mt-0.5">{aiDecision}</p>
              </div>
              {confidence !== null && (
                <span className="text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full">
                  {confidence}% conf.
                </span>
              )}
            </div>
          )}

          {/* Sélecteur de décision */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Décision à envoyer <span className="text-red-400 font-normal normal-case">*</span>
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
                    onChange={() => onResolution(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-base">{opt.emoji}</span>
                  <span className="text-xs font-medium">{opt.label}</span>
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
              onChange={e => onNote(e.target.value)}
              placeholder="Commentaire visible dans la notification client…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || !resolution}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}