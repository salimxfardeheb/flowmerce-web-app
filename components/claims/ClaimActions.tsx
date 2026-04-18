"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────
type Resolution = "Refund" | "Exchange" | "Repair" | "Reject";
type Shipping   = "Client" | "Vendeur" | "Shared";

type Props = {
  claimId:          string;
  // Données ML existantes passées depuis la page
  aiDecision?:      string | null;
  aiScore?:         number | null;
  prediction?:      Record<string, unknown> | null;
  currentStatus?:   string;
};

const RESOLUTION_OPTIONS: { value: Resolution; label: string; emoji: string; cls: string }[] = [
  { value: "Refund",   label: "Remboursement", emoji: "💰", cls: "border-green-300 bg-green-50 text-green-800"  },
  { value: "Exchange", label: "Échange",        emoji: "🔄", cls: "border-blue-300 bg-blue-50 text-blue-800"    },
  { value: "Repair",   label: "Réparation",     emoji: "🔧", cls: "border-orange-300 bg-orange-50 text-orange-800" },
  { value: "Reject",   label: "Refus",           emoji: "❌", cls: "border-red-300 bg-red-50 text-red-800"      },
];

const SHIPPING_OPTIONS: { value: Shipping; label: string }[] = [
  { value: "Client",  label: "À la charge du client"  },
  { value: "Vendeur", label: "À la charge du vendeur" },
  { value: "Shared",  label: "Partagé (50/50)"        },
];

const STATUS_OPTIONS = [
  { value: "APPROVED",    label: "Approuver",       cls: "bg-green-600 hover:bg-green-700 text-white" },
  { value: "REJECTED",    label: "Rejeter",         cls: "bg-red-100 hover:bg-red-200 text-red-700"   },
  { value: "IN_PROGRESS", label: "En cours",        cls: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
];

export function ClaimActions({ claimId, aiDecision, aiScore, prediction, currentStatus }: Props) {
  const router  = useRouter();
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState<"status" | "ml">("status");

  // Override ML
  const [resolution,  setResolution]  = useState<Resolution | "">(
    (aiDecision as Resolution) ?? ""
  );
  const [shipping,    setShipping]    = useState<Shipping | "">(
    (prediction as any)?.shipping_paid_by?.prediction ?? ""
  );
  const [overrideNote, setOverrideNote] = useState("");

  // Quick status buttons (without modal)
  const quickStatus = async (status: string) => {
    setLoading(true);
    await fetch(`/api/claims/${claimId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  };

  // Full update with ML override
  const handleSave = async () => {
    setLoading(true);
    await fetch(`/api/claims/${claimId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status:           tab === "status" ? undefined : undefined,
        aiDecision:       resolution  || undefined,
        overrideShipping: shipping    || undefined,
        overrideNote:     overrideNote || undefined,
      }),
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  };

  const predAny = prediction as any;
  const mlResolution = aiDecision;
  const mlShipping   = predAny?.shipping_paid_by?.prediction
    ?? predAny?.shipping?.responsible
    ?? null;
  const confidence   = aiScore != null ? Math.round(aiScore * 100) : null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Quick status buttons */}
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

      {/* Override ML button — seulement si une décision ML existe */}
      {mlResolution && (
        <button
          onClick={() => setOpen(true)}
          className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors border border-purple-200"
        >
          🤖 Modifier décision ML
        </button>
      )}

      {/* ── Modal override ML ── */}
      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-gray-800">Révision de la décision ML</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Décision actuelle :{" "}
                  <span className="font-medium text-purple-700">{mlResolution}</span>
                  {confidence !== null && (
                    <span className="ml-1 text-gray-400">({confidence}% conf.)</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Résolution */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Résolution *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        resolution === opt.value
                          ? opt.cls + " border-current"
                          : "border-gray-200 hover:border-gray-300 bg-gray-50"
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
                      <span className="text-base">{opt.emoji}</span>
                      <span className="text-xs font-medium">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Shipping */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Frais de retour
                  {mlShipping && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">
                      (ML : {mlShipping})
                    </span>
                  )}
                </label>
                <select
                  value={shipping}
                  onChange={e => setShipping(e.target.value as Shipping)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">— Garder la décision ML —</option>
                  {SHIPPING_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Note justificative */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note de justification (optionnel)
                </label>
                <textarea
                  rows={2}
                  value={overrideNote}
                  onChange={e => setOverrideNote(e.target.value)}
                  placeholder="Expliquez pourquoi vous modifiez la décision..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>
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
                disabled={loading || !resolution}
                className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Enregistrement..." : "Confirmer la modification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}