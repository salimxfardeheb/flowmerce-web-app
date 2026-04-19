"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";
import {
  CheckCircle2,
  AlertCircle,
  Check,
  RefreshCw,
  CreditCard,
  Wrench,
  ShieldAlert,
  Tag,
  FileText,
  BarChart2,
  Clock,
  Users,
  Cpu,
} from "lucide-react";

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

// ─── Sous-composants ──────────────────────────────────────────

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-start gap-2.5">
        {Icon && <Icon size={14} className="text-gray-400 shrink-0 mt-0.5" />}
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 mt-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
          checked ? "bg-indigo-600" : "bg-gray-200"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-150 ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  description,
  color = "#4f46e5",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
  description?: string;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">
          {value} {unit}
        </span>
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full">
        <div
          className="absolute left-0 top-0 h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{min} {unit}</span>
        <span className="text-xs text-gray-400">{max} {unit}</span>
      </div>
      {description && (
        <p className="text-xs text-gray-500 mt-2">{description}</p>
      )}
    </div>
  );
}

function TagSelector({
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyLabel?: string;
}) {
  const toggle = (opt: string) =>
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt]
    );

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-gray-500">
          {selected.length} / {options.length} sélectionné
          {selected.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() =>
            onChange(selected.length === options.length ? [] : [...options])
          }
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition"
        >
          {selected.length === options.length
            ? "Tout désélectionner"
            : "Tout sélectionner"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${
              selected.includes(opt)
                ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            }`}
          >
            {opt}
          </button>
        ))}
        {options.length === 0 && (
          <p className="text-xs text-gray-400">Aucune catégorie disponible</p>
        )}
        {options.length > 0 && selected.length === 0 && emptyLabel && (
          <p className="text-xs text-gray-400 mt-1 w-full">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────
export default function ReturnPolicyPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [policy, setPolicy]                         = useState<Policy>(defaultPolicy);
  const [vendorCategories, setVendorCategories]     = useState<string[]>([]);
  const [loading, setLoading]                       = useState(true);
  const [saving, setSaving]                         = useState(false);
  const [success, setSuccess]                       = useState(false);
  const [error, setError]                           = useState("");
  const [isPolicyConfigured, setIsPolicyConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/return-policy")
      .then((r) => r.json())
      .then((data) => {
        setVendorCategories(data.vendorCategories ?? []);
        if (data.policy) {
          setIsPolicyConfigured(true);
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
      .catch(() => setError("Impossible de charger la politique de retour"))
      .finally(() => setLoading(false));
  }, []);

  const sessionReady = session !== undefined;
  const [vendorCheck, setVendorCheck] = useState<"loading" | "ok" | "redirect">("loading");

  useEffect(() => {
    fetch("/api/vendors/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.noVendor || data.isBlocked) setVendorCheck("redirect");
        else setVendorCheck("ok");
      })
      .catch(() => setVendorCheck("redirect"));
  }, []);

  useEffect(() => {
    if (vendorCheck === "redirect") router.push("/dashboard");
  }, [vendorCheck, router]);

  if (!sessionReady || loading || vendorCheck === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-gray-400">Chargement...</p>
      </div>
    );
  }

  if (vendorCheck === "redirect") return null;

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setPolicy((p) => ({ ...p, [key]: value }));

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
        setError(data.error || "Une erreur est survenue lors de la sauvegarde");
        return;
      }
      setSuccess(true);
      setIsPolicyConfigured(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
    } finally {
      setSaving(false);
    }
  };

  const fraudRisk =
    policy.fraudScoreThreshold >= 80
      ? { label: "Risque faible",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" }
      : policy.fraudScoreThreshold >= 55
      ? { label: "Risque modéré",  color: "#d97706", bg: "#fffbeb", border: "#fde68a" }
      : { label: "Risque élevé",   color: "#dc2626", bg: "#fef2f2", border: "#fecaca" };

  const summaryRows = [
    {
      Icon: Users,
      label: "Validation",
      value:
        policy.validationMode === "AI_AUTO"
          ? "Décision automatique"
          : "Validation manuelle",
    },
    {
      Icon: Clock,
      label: "Délai",
      value: `${policy.maxClaimDays} jour${policy.maxClaimDays > 1 ? "s" : ""}`,
    },
    {
      Icon: RefreshCw,
      label: "Types",
      value:
        policy.acceptedTypes.length > 0
          ? policy.acceptedTypes
              .map((t) =>
                t === "EXCHANGE"
                  ? "Échange"
                  : t === "REFUND"
                  ? "Remboursement"
                  : "Réparation"
              )
              .join(", ")
          : "Aucun",
    },
    {
      Icon: ShieldAlert,
      label: "Fraude",
      value: `Seuil ${policy.fraudScoreThreshold} — ${fraudRisk.label}`,
    },
    {
      Icon: Tag,
      label: "Catégories",
      value: `${vendorCategories.length} catégorie${vendorCategories.length !== 1 ? "s" : ""}`,
    },
    {
      Icon: FileText,
      label: "Motifs",
      value:
        policy.acceptedReturnReasons.length === 0
          ? "Tous acceptés"
          : `${policy.acceptedReturnReasons.length} configuré${policy.acceptedReturnReasons.length !== 1 ? "s" : ""}`,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <VendorAccessGuard />

      {/* ── Barre de page ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-gray-900">
                Politique de retours
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
                  isPolicyConfigured
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-gray-50 text-gray-500 border-gray-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPolicyConfigured ? "bg-green-500" : "bg-gray-400"
                  }`}
                />
                {isPolicyConfigured ? "Actif" : "Non configuré"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Règles utilisées pour automatiser les décisions de remboursement,
              échange et détection de fraude.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {success && (
              <span className="flex items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 size={13} />
                Politique mise à jour
              </span>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || policy.acceptedTypes.length === 0}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Notification d'erreur ── */}
      {error && (
        <div className="px-8 pt-5">
          <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm max-w-4xl">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Contenu principal ── */}
      <div className="px-8 py-6 flex gap-6 items-start max-w-5xl">

        {/* ─── Colonne principale : sections ─── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Section 1 — Traitement des demandes */}
          <SectionCard
            title="Traitement des demandes"
            description="Mode de validation et fenêtre de retour autorisée."
            icon={Users}
          >
            <div className="space-y-6">

              {/* Radio : mode de validation */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Mode de validation
                </p>
                <div className="space-y-2">
                  {([
                    {
                      mode: "MANUAL" as const,
                      Icon: Users,
                      label: "Validation manuelle",
                      desc: "Chaque demande est examinée et validée par votre équipe avant toute décision.",
                      badge: undefined as string | undefined,
                    },
                    {
                      mode: "AI_AUTO" as const,
                      Icon: Cpu,
                      label: "Décision automatique",
                      desc: "Flowmerce applique vos règles et décide automatiquement, sans intervention humaine.",
                      badge: "Recommandé" as string | undefined,
                    },
                  ]).map(({ mode, Icon, label, desc, badge }) => (
                    <label
                      key={mode}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                        policy.validationMode === mode
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="validationMode"
                        value={mode}
                        checked={policy.validationMode === mode}
                        onChange={() => set("validationMode", mode)}
                        className="mt-0.5 accent-indigo-600"
                      />
                      <Icon
                        size={14}
                        className={`shrink-0 mt-0.5 ${
                          policy.validationMode === mode
                            ? "text-indigo-600"
                            : "text-gray-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-medium ${
                              policy.validationMode === mode
                                ? "text-indigo-700"
                                : "text-gray-800"
                            }`}
                          >
                            {label}
                          </span>
                          {badge && (
                            <span className="text-xs font-semibold bg-indigo-600 text-white px-2 py-0.5 rounded">
                              {badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                  Fenêtre de retour
                </p>
                <SliderField
                  label="Délai maximum de réclamation"
                  value={policy.maxClaimDays}
                  min={1}
                  max={90}
                  unit="jours"
                  onChange={(v) => set("maxClaimDays", v)}
                  description={`Les clients disposent de ${policy.maxClaimDays} jour${policy.maxClaimDays > 1 ? "s" : ""} après la livraison pour déposer une demande.`}
                />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <Toggle
                  checked={policy.allowRefusalOnDelivery}
                  onChange={(v) => set("allowRefusalOnDelivery", v)}
                  label="Autoriser le refus à la livraison"
                  description="Le client peut refuser le colis auprès du livreur, sans déposer de demande formelle."
                />
              </div>
            </div>
          </SectionCard>

          {/* Section 2 — Types de réclamations */}
          <SectionCard
            title="Types de réclamations acceptées"
            description="Sélectionnez au minimum un type."
            icon={RefreshCw}
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "EXCHANGE", Icon: RefreshCw,  label: "Échange",       desc: "Remplacement produit" },
                { value: "REFUND",   Icon: CreditCard, label: "Remboursement", desc: "Retour financier" },
                { value: "REPAIR",   Icon: Wrench,     label: "Réparation",    desc: "Remise en état" },
              ].map(({ value, Icon, label, desc }) => {
                const active = policy.acceptedTypes.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      set(
                        "acceptedTypes",
                        active
                          ? policy.acceptedTypes.filter((t) => t !== value)
                          : [...policy.acceptedTypes, value]
                      )
                    }
                    className={`p-4 rounded-lg border text-left transition-all ${
                      active
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon
                        size={13}
                        className={active ? "text-indigo-600" : "text-gray-400"}
                      />
                      {active && (
                        <Check size={11} strokeWidth={3} className="text-indigo-600" />
                      )}
                    </div>
                    <p
                      className={`text-xs font-semibold ${
                        active ? "text-indigo-700" : "text-gray-800"
                      }`}
                    >
                      {label}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </button>
                );
              })}
            </div>
            {policy.acceptedTypes.length === 0 && (
              <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Sélectionnez au moins un type de réclamation.
              </p>
            )}
          </SectionCard>

          {/* Section 3 — Détection de fraude */}
          <SectionCard
            title="Détection de fraude"
            description="Les demandes dont le score dépasse ce seuil sont soumises à vérification."
            icon={ShieldAlert}
          >
            <div className="space-y-4">
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg border text-sm"
                style={{ background: fraudRisk.bg, borderColor: fraudRisk.border }}
              >
                <ShieldAlert
                  size={13}
                  style={{ color: fraudRisk.color }}
                  className="shrink-0"
                />
                <p
                  style={{ color: fraudRisk.color }}
                  className="flex-1 text-xs"
                >
                  Au-dessus de ce seuil, une demande est marquée comme suspecte
                  et soumise à vérification manuelle.
                </p>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded shrink-0"
                  style={{
                    background: fraudRisk.color + "18",
                    color: fraudRisk.color,
                  }}
                >
                  {fraudRisk.label}
                </span>
              </div>
              <SliderField
                label="Seuil de détection de fraude"
                value={policy.fraudScoreThreshold}
                min={10}
                max={95}
                unit="/ 100"
                onChange={(v) => set("fraudScoreThreshold", v)}
                color={
                  policy.fraudScoreThreshold >= 80
                    ? "#16a34a"
                    : policy.fraudScoreThreshold >= 55
                    ? "#d97706"
                    : "#dc2626"
                }
                description={`Score ≥ ${policy.fraudScoreThreshold} → demande marquée comme suspecte`}
              />
            </div>
          </SectionCard>

          {/* Section 4 — Remboursement conditionnel */}
          <SectionCard
            title="Remboursement conditionnel"
            description="Appliquer un remboursement partiel selon le délai ou l'état du produit."
            icon={BarChart2}
          >
            <div className="space-y-5">
              <Toggle
                checked={policy.partialRefundEnabled}
                onChange={(v) => set("partialRefundEnabled", v)}
                label="Activer le remboursement conditionnel"
                description="Permettre un remboursement partiel au lieu d'un refus complet."
              />
              {policy.partialRefundEnabled && (
                <div className="pl-4 border-l-2 border-gray-200 space-y-5 pt-1">
                  <SliderField
                    label="Remboursement après 50 % du délai"
                    value={policy.partialRefundAfter50pct}
                    min={10}
                    max={100}
                    unit="%"
                    onChange={(v) => set("partialRefundAfter50pct", v)}
                    color="#7c3aed"
                    description={`Retour après J${Math.round(policy.maxClaimDays * 0.5)} → ${policy.partialRefundAfter50pct} % du montant remboursé`}
                  />
                  <SliderField
                    label="Pénalité si produit utilisé"
                    value={policy.partialRefundUsedPenalty}
                    min={0}
                    max={50}
                    unit="%"
                    onChange={(v) => set("partialRefundUsedPenalty", v)}
                    color="#dc2626"
                    description="Déduction appliquée si le produit a été ouvert ou utilisé."
                  />
                  <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1.5">
                      <BarChart2 size={11} />
                      Impact financier estimé
                    </p>
                    <p className="text-xs text-gray-500">
                      Produit à 10 000 DA — retour tardif + produit utilisé ={" "}
                      <strong className="text-gray-800">
                        {Math.round(
                          10000 *
                            (policy.partialRefundAfter50pct / 100) *
                            (1 - policy.partialRefundUsedPenalty / 100)
                        ).toLocaleString("fr-DZ")}{" "}
                        DA
                      </strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Section 5 — Catégories */}
          <SectionCard
            title="Règles par catégorie de produit"
            description="Une catégorie ne peut appartenir qu'à une seule règle à la fois."
            icon={Tag}
          >
            {vendorCategories.length === 0 ? (
              <div className="text-center py-8">
                <Tag size={22} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 font-medium">
                  Aucune catégorie définie
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Contactez le support pour en ajouter.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <p className="text-xs text-amber-700">
                    Ces catégories correspondent à celles déclarées lors de
                    votre inscription.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800">
                      Non remboursable
                    </p>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {policy.nonRefundableCategories.length} /{" "}
                      {vendorCategories.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Les demandes de remboursement pour ces catégories seront
                    automatiquement refusées.
                  </p>
                  <TagSelector
                    options={vendorCategories}
                    selected={policy.nonRefundableCategories}
                    onChange={(v) => set("nonRefundableCategories", v)}
                    emptyLabel="Aucune restriction — toutes les catégories sont remboursables."
                  />
                </div>

                <div className="border-t border-gray-100 pt-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-800">
                      Échange uniquement
                    </p>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {policy.exchangeOnlyCategories.length} /{" "}
                      {
                        vendorCategories.filter(
                          (c) =>
                            !policy.nonRefundableCategories.includes(c)
                        ).length
                      }
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Seul l&apos;échange est autorisé. Les catégories non
                    remboursables en sont exclues automatiquement.
                  </p>
                  <TagSelector
                    options={vendorCategories.filter(
                      (c) => !policy.nonRefundableCategories.includes(c)
                    )}
                    selected={policy.exchangeOnlyCategories}
                    onChange={(v) => set("exchangeOnlyCategories", v)}
                    emptyLabel="Aucune restriction — remboursement et échange autorisés."
                  />
                </div>
              </div>
            )}
          </SectionCard>

          {/* Section 6 — Motifs */}
          <SectionCard
            title="Motifs de retour acceptés"
            description="Laissez vide pour accepter tous les motifs."
            icon={FileText}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">
                  {policy.acceptedReturnReasons.length === 0
                    ? "Tous les motifs sont acceptés"
                    : `${policy.acceptedReturnReasons.length} motif${policy.acceptedReturnReasons.length > 1 ? "s" : ""} sélectionné${policy.acceptedReturnReasons.length > 1 ? "s" : ""}`}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Les motifs sélectionnés seront affichés dans le formulaire de
                retour de vos clients.
              </p>
              <TagSelector
                options={ALL_REASONS}
                selected={policy.acceptedReturnReasons}
                onChange={(v) => set("acceptedReturnReasons", v)}
                emptyLabel="Tous les motifs sont acceptés."
              />
              {policy.acceptedReturnReasons.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    Seuls ces motifs seront affichés dans le formulaire de retour.
                  </p>
                </div>
              )}
            </div>
          </SectionCard>

        </div>

        {/* ─── Colonne droite : résumé sticky ─── */}
        <div className="w-60 shrink-0">
          <div className="sticky top-6 space-y-3">

            {/* Carte résumé */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Règles actives
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {summaryRows.map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2.5 px-4 py-3">
                    <Icon size={12} className="text-gray-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className="text-xs font-medium text-gray-900 mt-0.5 wrap-break-word leading-relaxed">
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bouton enregistrer répété */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || policy.acceptedTypes.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
