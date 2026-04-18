"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";

// ─── Types ────────────────────────────────────────────────────
type Policy = {
  allowRefusalOnDelivery:  boolean;
  maxClaimDays:            number;
  acceptedTypes:           string[];
  validationMode:          "MANUAL" | "AI_AUTO";
  fraudScoreThreshold:     number;
  nonRefundableCategories: string[];
  exchangeOnlyCategories:  string[];
  partialRefundEnabled:    boolean;
  partialRefundAfter50pct: number;
  partialRefundUsedPenalty:number;
  acceptedReturnReasons:   string[];
};

const defaultPolicy: Policy = {
  allowRefusalOnDelivery:  false,
  maxClaimDays:            14,
  acceptedTypes:           ["EXCHANGE", "REFUND"],
  validationMode:          "MANUAL",
  fraudScoreThreshold:     70,
  nonRefundableCategories: [],
  exchangeOnlyCategories:  [],
  partialRefundEnabled:    false,
  partialRefundAfter50pct: 50,
  partialRefundUsedPenalty:20,
  acceptedReturnReasons:   [],
};

const ALL_REASONS = [
  "Produit défectueux",
  "Produit contrefait",
  "Produit endommagé livraison",
  "Changement d'avis",
  "Panne après utilisation",
  "Mauvaise taille",
  "Allergie/Réaction",
  "Ne correspond pas",
  "Erreur de commande vendeur",
  "Pièces manquantes",
];

type StepId = 1 | 2 | 3 | 4;

const STEPS: { id: StepId; icon: string; title: string; subtitle: string }[] = [
  { id: 1, icon: "⚡", title: "Mode & Délais",      subtitle: "Validation et fenêtre de retour" },
  { id: 2, icon: "🔄", title: "Types & Fraude",     subtitle: "Réclamations acceptées et protection" },
  { id: 3, icon: "🏷️", title: "Catégories",         subtitle: "Règles par catégorie de produit" },
  { id: 4, icon: "📝", title: "Motifs & Résumé",    subtitle: "Raisons acceptées et confirmation" },
];

// ─── Sous-composants ──────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${checked ? "bg-indigo-600" : "bg-gray-300"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-7" : "left-1"}`} />
      </button>
    </div>
  );
}

function SliderField({ label, value, min, max, unit, onChange, description, color = "#4f46e5" }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (v: number) => void; description?: string; color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="bg-indigo-50 text-indigo-700 text-sm font-bold px-3 py-1 rounded-lg">
          {value} {unit}
        </span>
      </div>
      <div className="relative h-2 bg-gray-200 rounded-full">
        <div className="absolute left-0 top-0 h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        <input type="range" min={min} max={max} value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{min} {unit}</span>
        <span className="text-xs text-gray-400">{max} {unit}</span>
      </div>
      {description && <p className="text-xs text-gray-400 mt-2">{description}</p>}
    </div>
  );
}

function TagSelector({ options, selected, onChange, emptyLabel }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; emptyLabel?: string;
}) {
  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-gray-400">{selected.length} / {options.length} sélectionné</span>
        <button type="button" onClick={() => onChange(selected.length === options.length ? [] : [...options])}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
          {selected.length === options.length ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${
              selected.includes(opt)
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-indigo-200"
            }`}>
            {opt}
          </button>
        ))}
        {options.length === 0 && <p className="text-xs text-gray-400 italic">Aucune catégorie disponible</p>}
        {options.length > 0 && selected.length === 0 && emptyLabel && (
          <p className="text-xs text-gray-400 italic mt-1 w-full">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────
export default function ReturnPolicyPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [policy, setPolicy]               = useState<Policy>(defaultPolicy);
  const [vendorCategories, setVendorCategories] = useState<string[]>([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [success, setSuccess]             = useState(false);
  const [error, setError]                 = useState("");
  const [currentStep, setCurrentStep]     = useState<StepId>(1);

  useEffect(() => {
    fetch("/api/return-policy")
      .then((r) => r.json())
      .then((data) => {
        // Charger les catégories du vendeur (choisies à l'inscription)
        setVendorCategories(data.vendorCategories ?? []);

        if (data.policy) {
          setPolicy((prev) => ({
            ...prev,
            ...data.policy,
            acceptedTypes:
              typeof data.policy.acceptedTypes === "string"
                ? data.policy.acceptedTypes.split(",")
                : (data.policy.acceptedTypes ?? prev.acceptedTypes),
            fraudScoreThreshold:      data.policy.fraudScoreThreshold      ?? 70,
            nonRefundableCategories:  data.policy.nonRefundableCategories  ?? [],
            exchangeOnlyCategories:   data.policy.exchangeOnlyCategories   ?? [],
            partialRefundEnabled:     data.policy.partialRefundEnabled      ?? false,
            partialRefundAfter50pct:  data.policy.partialRefundAfter50pct  ?? 50,
            partialRefundUsedPenalty: data.policy.partialRefundUsedPenalty ?? 20,
            acceptedReturnReasons:    data.policy.acceptedReturnReasons    ?? [],
          }));
        }
      })
      .catch(() => setError("Impossible de charger la politique"))
      .finally(() => setLoading(false));
  }, []);

  const user = session?.user as any;
  const sessionReady = session !== undefined;
  const [vendorCheck, setVendorCheck] = useState<"loading" | "ok" | "redirect">("loading");

  // Vérification côté API : ADMIN sans Vendor → redirect /dashboard
  useEffect(() => {
    fetch("/api/vendors/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.noVendor || data.isBlocked) {
          setVendorCheck("redirect");
        } else {
          setVendorCheck("ok");
        }
      })
      .catch(() => setVendorCheck("redirect"));
  }, []);

  useEffect(() => {
    if (vendorCheck === "redirect") router.push("/dashboard");
  }, [vendorCheck, router]);

  // Attendre session + fetch policy + vérification vendor
  if (!sessionReady || loading || vendorCheck === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-sm">Chargement...</div>
      </div>
    );
  }

  if (vendorCheck === "redirect") return null;

  // Garde de sécurité finale pour les vendeurs non approuvés
  const isAdmin = user?.role === "ADMIN";
  if (!isAdmin && user?.vendorStatus !== "APPROVED") return null;

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setPolicy((p) => ({ ...p, [key]: value }));

  // Validation par étape
  const canGoNext = (): boolean => {
    if (currentStep === 1) return policy.maxClaimDays >= 1;
    if (currentStep === 2) return policy.acceptedTypes.length >= 1;
    if (currentStep === 3) return true; // catégories sont optionnelles
    return true;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    setSuccess(false);
    try {
      const res = await fetch("/api/return-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la sauvegarde");
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  const fraudLevel =
    policy.fraudScoreThreshold >= 80 ? { label: "Tolérant",  color: "#16a34a", bg: "#f0fdf4" }
    : policy.fraudScoreThreshold >= 55 ? { label: "Équilibré", color: "#d97706", bg: "#fffbeb" }
    : { label: "Strict", color: "#dc2626", bg: "#fef2f2" };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-3 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <VendorAccessGuard />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-xl">
            📋
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Politique de retours</h1>
            <p className="text-sm text-gray-400">Configurez les règles appliquées par l'IA</p>
          </div>
        </div>
      </div>

      {/* Stepper horizontal */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div
              className="flex flex-col items-center cursor-pointer group"
              onClick={() => {
                // Autoriser navigation vers étapes précédentes seulement
                if (s.id < currentStep) setCurrentStep(s.id);
              }}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                currentStep > s.id
                  ? "bg-green-500 text-white"
                  : currentStep === s.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {currentStep > s.id ? "✓" : s.icon}
              </div>
              <span className={`text-xs mt-1 font-medium hidden sm:block ${
                currentStep === s.id ? "text-indigo-600" : "text-gray-400"
              }`}>{s.title}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 transition-all ${currentStep > s.id ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-sm flex gap-2">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl mb-5 text-sm flex gap-2">
          ✅ Politique sauvegardée et appliquée à toutes vos prédictions !
        </div>
      )}

      {/* Contenu de l'étape */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">

        {/* Titre de l'étape */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center text-lg">
            {STEPS[currentStep - 1].icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800">{STEPS[currentStep - 1].title}</h2>
            <p className="text-xs text-gray-400">{STEPS[currentStep - 1].subtitle}</p>
          </div>
          <div className="ml-auto text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
            {currentStep} / {STEPS.length}
          </div>
        </div>

        {/* ── Étape 1 : Mode de validation + Délais ── */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Mode de validation */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Mode de validation</p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { mode: "MANUAL",   icon: "👤", label: "Manuel",        desc: "Vous décidez de chaque réclamation",          tag: undefined },
                  { mode: "AI_AUTO",  icon: "🤖", label: "Automatique IA", desc: "Le modèle Flowmerce analyse et décide",       tag: "Recommandé" },
                ] as const).map(({ mode, icon, label, desc, tag }) => (
                  <button key={mode} type="button" onClick={() => set("validationMode", mode)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      policy.validationMode === mode ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-200"
                    }`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-2xl">{icon}</span>
                      {tag && <span className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">{tag}</span>}
                    </div>
                    <p className={`text-sm font-bold mb-1 ${policy.validationMode === mode ? "text-indigo-700" : "text-gray-800"}`}>{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Délai */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fenêtre de retour</p>
              <SliderField
                label="Délai maximum de réclamation"
                value={policy.maxClaimDays} min={1} max={90} unit="jours"
                onChange={(v) => set("maxClaimDays", v)}
                description={`Les clients ont ${policy.maxClaimDays} jour${policy.maxClaimDays > 1 ? "s" : ""} après la livraison pour déposer une réclamation`}
              />
            </div>

            <hr className="border-gray-100" />

            <Toggle
              checked={policy.allowRefusalOnDelivery}
              onChange={(v) => set("allowRefusalOnDelivery", v)}
              label="Autoriser le refus à la livraison"
              description="Le client peut refuser le colis directement au livreur"
            />
          </div>
        )}

        {/* ── Étape 2 : Types de réclamations + Fraude ── */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* Types acceptés */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Types de réclamations acceptées <span className="text-red-500">*</span>
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "EXCHANGE", label: "Échange",        icon: "🔄", desc: "Remplacer" },
                  { value: "REFUND",   label: "Remboursement",  icon: "💰", desc: "Rembourser" },
                  { value: "REPAIR",   label: "Réparation",     icon: "🔧", desc: "Réparer" },
                ].map(({ value, label, icon, desc }) => {
                  const active = policy.acceptedTypes.includes(value);
                  return (
                    <button key={value} type="button"
                      onClick={() => set("acceptedTypes", active ? policy.acceptedTypes.filter((t) => t !== value) : [...policy.acceptedTypes, value])}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${active ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:border-indigo-200"}`}>
                      <span className="text-2xl block mb-1">{icon}</span>
                      <p className={`text-sm font-bold ${active ? "text-indigo-700" : "text-gray-700"}`}>{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </button>
                  );
                })}
              </div>
              {policy.acceptedTypes.length === 0 && (
                <p className="text-xs text-red-500 mt-2">⚠️ Sélectionnez au moins un type</p>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Seuil de fraude */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Seuil de détection de fraude</p>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border" style={{ background: fraudLevel.bg, borderColor: fraudLevel.color + "44" }}>
                <span className="text-lg">{policy.fraudScoreThreshold >= 80 ? "😌" : policy.fraudScoreThreshold >= 55 ? "⚖️" : "🚨"}</span>
                <p className="text-sm font-medium" style={{ color: fraudLevel.color }}>
                  {policy.fraudScoreThreshold >= 80 ? "Seuls les cas très suspects seront bloqués"
                    : policy.fraudScoreThreshold >= 55 ? "Équilibre entre protection et expérience client"
                    : "Politique stricte — beaucoup de réclamations seront examinées"}
                </p>
                <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full" style={{ background: fraudLevel.color + "22", color: fraudLevel.color }}>
                  {fraudLevel.label}
                </span>
              </div>
              <SliderField
                label="Seuil de fraude" value={policy.fraudScoreThreshold} min={10} max={95} unit="/ 100"
                onChange={(v) => set("fraudScoreThreshold", v)}
                color={policy.fraudScoreThreshold >= 80 ? "#16a34a" : policy.fraudScoreThreshold >= 55 ? "#d97706" : "#dc2626"}
                description={`Score ≥ ${policy.fraudScoreThreshold} → réclamation marquée comme suspecte`}
              />
            </div>

            <hr className="border-gray-100" />

            {/* Remboursement partiel */}
            <div className="space-y-4">
              <Toggle
                checked={policy.partialRefundEnabled}
                onChange={(v) => set("partialRefundEnabled", v)}
                label="Activer le remboursement partiel"
                description="Rembourser un pourcentage selon les conditions"
              />
              {policy.partialRefundEnabled && (
                <div className="pl-4 border-l-2 border-indigo-100 space-y-4">
                  <SliderField label="% remboursé après 50% du délai" value={policy.partialRefundAfter50pct}
                    min={10} max={100} unit="%" onChange={(v) => set("partialRefundAfter50pct", v)} color="#7c3aed"
                    description={`Ex: retour à J${Math.round(policy.maxClaimDays * 0.6)} → ${policy.partialRefundAfter50pct}% remboursé`} />
                  <SliderField label="% déduit si produit utilisé" value={policy.partialRefundUsedPenalty}
                    min={0} max={50} unit="%" onChange={(v) => set("partialRefundUsedPenalty", v)} color="#dc2626"
                    description="Pénalité pour produit ouvert ou utilisé" />
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-500 font-semibold mb-1">📊 Simulation</p>
                    <p className="text-xs text-gray-400">
                      Produit à 10 000 DA, retour tardif + utilisé ={" "}
                      <strong className="text-indigo-600">
                        {Math.round(10000 * (policy.partialRefundAfter50pct / 100) * (1 - policy.partialRefundUsedPenalty / 100)).toLocaleString("fr-DZ")} DA
                      </strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Étape 3 : Catégories (celles choisies à l'inscription) ── */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {vendorCategories.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-4xl mb-3">🏷️</p>
                <p className="text-sm text-gray-500">Aucune catégorie définie lors de l'inscription.</p>
                <p className="text-xs text-gray-400 mt-1">Contactez le support pour en ajouter.</p>
              </div>
            ) : (
              <>
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                  <p className="text-xs text-indigo-700">
                    📌 Ces catégories sont celles que vous avez sélectionnées lors de votre inscription.
                    Configurez ici les règles spécifiques à chacune.
                  </p>
                </div>

                {/* Catégories non remboursables */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">🚫 Catégories non remboursables</p>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      {policy.nonRefundableCategories.length} / {vendorCategories.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Ces catégories ne peuvent pas faire l'objet d'un remboursement</p>
                  <TagSelector
                    options={vendorCategories}
                    selected={policy.nonRefundableCategories}
                    onChange={(v) => set("nonRefundableCategories", v)}
                    emptyLabel="Aucune restriction — tout est remboursable"
                  />
                </div>

                <hr className="border-gray-100" />

                {/* Catégories échange seulement */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">↔️ Catégories — échange seulement</p>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      {policy.exchangeOnlyCategories.length} / {vendorCategories.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Seul l'échange est autorisé pour ces catégories</p>
                  <TagSelector
                    options={vendorCategories.filter((c) => !policy.nonRefundableCategories.includes(c))}
                    selected={policy.exchangeOnlyCategories}
                    onChange={(v) => set("exchangeOnlyCategories", v)}
                    emptyLabel="Aucune restriction"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Étape 4 : Motifs acceptés + Résumé ── */}
        {currentStep === 4 && (
          <div className="space-y-6">
            {/* Raisons acceptées */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-700">📝 Motifs de retour acceptés</p>
                <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                  {policy.acceptedReturnReasons.length === 0 ? "Tous acceptés" : `${policy.acceptedReturnReasons.length} sélectionnés`}
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Laissez vide pour tout accepter. Ces motifs seront affichés dans le formulaire de retour de vos clients.
              </p>
              <TagSelector
                options={ALL_REASONS}
                selected={policy.acceptedReturnReasons}
                onChange={(v) => set("acceptedReturnReasons", v)}
                emptyLabel="Tous les motifs sont acceptés"
              />
              {policy.acceptedReturnReasons.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <p className="text-xs text-amber-700">
                    ⚠️ Seuls ces motifs seront affichés dans le formulaire de retour de vos boutiques clientes.
                  </p>
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* Résumé */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Résumé de votre politique</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Mode",           value: policy.validationMode === "AI_AUTO" ? "🤖 Auto IA" : "👤 Manuel" },
                  { label: "Délai retour",   value: `📅 ${policy.maxClaimDays} jours` },
                  { label: "Types",          value: `🔄 ${policy.acceptedTypes.length} type(s)` },
                  { label: "Anti-fraude",    value: `🛡️ Seuil ${policy.fraudScoreThreshold}` },
                  { label: "Catégories",     value: `🏷️ ${vendorCategories.length} catégorie(s)` },
                  { label: "Motifs actifs",  value: policy.acceptedReturnReasons.length === 0 ? "📝 Tous" : `📝 ${policy.acceptedReturnReasons.length} motif(s)` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Boutons de navigation */}
      <div className="flex gap-3">
        {currentStep > 1 && (
          <button type="button" onClick={() => setCurrentStep((s) => (s - 1) as StepId)}
            className="flex-1 border-2 border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
            ← Retour
          </button>
        )}

        {currentStep < 4 ? (
          <button type="button" onClick={() => { if (canGoNext()) setCurrentStep((s) => (s + 1) as StepId); }}
            disabled={!canGoNext()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm">
            Suivant →
          </button>
        ) : (
          <button type="button" onClick={handleSubmit}
            disabled={saving || policy.acceptedTypes.length === 0}
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-3 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm">
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sauvegarde...
              </span>
            ) : "💾 Sauvegarder la politique"}
          </button>
        )}
      </div>
    </div>
  );
}