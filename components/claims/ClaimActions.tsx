"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, X } from "lucide-react";
import type { AIDecision } from "@/lib/constants";

type Resolution = AIDecision;

type Props = {
  claimId:        string;
  aiDecision?:    string | null;
  aiScore?:       number | null;
  currentStatus?: string;
};

const RESOLUTION_OPTIONS: { value: Resolution; label: string; dot: string; cls: string }[] = [
  { value: "Refund",   label: "Remboursement", dot: "bg-green-500", cls: "border-green-300 bg-green-50 text-green-800"   },
  { value: "Exchange", label: "Échange",        dot: "bg-blue-500",  cls: "border-blue-300 bg-blue-50 text-blue-800"     },
  { value: "Repair",   label: "Réparation",     dot: "bg-amber-400", cls: "border-amber-300 bg-amber-50 text-amber-800"  },
  { value: "Reject",   label: "Refus",           dot: "bg-red-500",   cls: "border-red-300 bg-red-50 text-red-800"       },
];

const STATUS_OPTIONS = [
  { value: "APPROVED",    label: "Approuver", cls: "bg-green-600 hover:bg-green-700 text-white"        },
  { value: "REJECTED",    label: "Rejeter",   cls: "bg-red-100 hover:bg-red-200 text-red-700"          },
  { value: "IN_PROGRESS", label: "En cours",  cls: "bg-blue-100 hover:bg-blue-200 text-blue-700"       },
];

export function ClaimActions({ claimId, aiDecision, aiScore, currentStatus }: Props) {
  const router = useRouter();
  const [open,         setOpen]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [resolution,   setResolution]   = useState<Resolution | "">((aiDecision as Resolution) ?? "");
  const [overrideNote, setOverrideNote] = useState("");

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

  const handleSave = async () => {
    if (!resolution) return;

    setLoading(true);
    const res = await fetch(`/api/claims/${claimId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiDecision:   resolution   || undefined,
        overrideNote: overrideNote || undefined,
      }),
    });
    setLoading(false);

    if (!res.ok) return;

    setOpen(false);
    router.refresh();
  };

  const confidence = aiScore != null ? Math.round(aiScore * 100) : null;

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

      {aiDecision && (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200"
        >
          <Brain className="w-3 h-3" />
          Modifier la décision
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md border border-gray-200">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Révision de la décision</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Décision actuelle :{" "}
                  <span className="font-medium text-indigo-700">{aiDecision}</span>
                  {confidence !== null && (
                    <span className="ml-1 text-gray-400">({confidence}% conf.)</span>
                  )}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Résolution */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Résolution <span className="text-red-400 font-normal normal-case">requis</span>
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
                  value={overrideNote}
                  onChange={e => setOverrideNote(e.target.value)}
                  placeholder="Expliquez pourquoi vous modifiez la décision…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !resolution}
                className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
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
