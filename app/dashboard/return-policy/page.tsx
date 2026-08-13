"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";
import { BTN_PRIMARY, Notice, PageHeader } from "@/components/dashboard/ui";
import {
  CheckCircle2,
  AlertCircle,
  Check,
  RefreshCw,
  CreditCard,
  Wrench,
  ShieldCheck,
  Clock,
  Users,
  Cpu,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
type Policy = {
  allowRefusalOnDelivery:  boolean;
  maxClaimDays:            number;
  acceptedTypes:           string[];
  validationMode:          "MANUAL" | "AI_AUTO";
  fraudScoreThreshold:     number;
  fraudReturnThreshold:    number;
};

type FraudLevel = "STRICT" | "BALANCED" | "FLEXIBLE";

const FRAUD_LEVELS: {
  id: FraudLevel;
  label: string;
  tagline: string;
  impact: string;
  warning?: string;
  threshold: number;
  badge?: string;
}[] = [
  {
    id: "STRICT",
    label: "Strict",
    tagline: "Réduit fortement les abus",
    impact: "Meilleure protection de vos revenus",
    warning: "Peut bloquer certains clients légitimes",
    threshold: 85,
  },
  {
    id: "BALANCED",
    label: "Équilibré",
    tagline: "Bon compromis sécurité / ventes",
    impact: "Idéal pour la grande majorité des boutiques",
    threshold: 70,
    badge: "Recommandé",
  },
  {
    id: "FLEXIBLE",
    label: "Flexible",
    tagline: "Favorise les ventes",
    impact: "Moins de friction, meilleure conversion",
    warning: "Accepte davantage de risques d'abus",
    threshold: 40,
  },
];

function thresholdToLevel(t: number): FraudLevel {
  if (t >= 80) return "STRICT";
  if (t >= 55) return "BALANCED";
  return "FLEXIBLE";
}

const defaultPolicy: Policy = {
  allowRefusalOnDelivery: false,
  maxClaimDays:           14,
  acceptedTypes:          ["EXCHANGE", "REFUND"],
  validationMode:         "MANUAL",
  fraudScoreThreshold:    70,
  fraudReturnThreshold:   4,
};

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
    <section className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        {Icon && (
          <span
            aria-hidden
            className="mt-px flex size-7 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink"
          >
            <Icon size={14} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[14px] font-bold text-ink">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-body">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}


// ─── Page principale ──────────────────────────────────────────
export default function ReturnPolicyPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [policy, setPolicy]                         = useState<Policy>(defaultPolicy);
  const [loading, setLoading]                       = useState(true);
  const [saving, setSaving]                         = useState(false);
  const [success, setSuccess]                       = useState(false);
  const [error, setError]                           = useState("");
  const [isPolicyConfigured, setIsPolicyConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/return-policy")
      .then((r) => r.json())
      .then((data) => {
        if (data.policy) {
          setIsPolicyConfigured(true);
          setPolicy((prev) => ({
            ...prev,
            ...data.policy,
            acceptedTypes:
              typeof data.policy.acceptedTypes === "string"
                ? data.policy.acceptedTypes.split(",")
                : (data.policy.acceptedTypes ?? prev.acceptedTypes),
            fraudScoreThreshold:  data.policy.fraudScoreThreshold  ?? 70,
            fraudReturnThreshold: data.policy.fraudReturnThreshold ?? 4,
          }));
        }
      })
      .catch(() => setError("Impossible de charger votre politique de retour"))
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-faint">Chargement...</p>
      </div>
    );
  }

  if (vendorCheck === "redirect") return null;

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setPolicy((p) => ({ ...p, [key]: value }));

  const currentFraudLevel = thresholdToLevel(policy.fraudScoreThreshold);
  const fraudLevelLabel   = FRAUD_LEVELS.find((f) => f.id === currentFraudLevel)?.label ?? "Équilibré";

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

  const summaryRows = [
    {
      Icon: RefreshCw,
      label: "Options acceptées",
      value:
        policy.acceptedTypes.length > 0
          ? policy.acceptedTypes
              .map((t) =>
                t === "EXCHANGE" ? "Échange" : t === "REFUND" ? "Remboursement" : "Réparation"
              )
              .join(", ")
          : "Aucune",
    },
    {
      Icon: Clock,
      label: "Délai de retour",
      value: `${policy.maxClaimDays} jour${policy.maxClaimDays > 1 ? "s" : ""}`,
    },
    {
      Icon: Users,
      label: "Traitement",
      value: policy.validationMode === "AI_AUTO" ? "Automatique" : "Manuel (vous validez)",
    },
    {
      Icon: ShieldCheck,
      label: "Protection",
      value: fraudLevelLabel,
    },
  ];

  return (
    <div>
      <VendorAccessGuard />

      {/* ── En-tête de page ── */}
      <div className="px-4 pt-4 sm:px-8 sm:pt-8">
        <div className="max-w-5xl">
          <PageHeader
            title="Politique de retour"
            subtitle="Le cadre que Flowmerce applique à chaque demande. Aucune décision, même automatique, n’en sortira."
            action={
              <div className="flex items-center gap-3">
                {success && (
                  <span
                    role="status"
                    className="flex items-center gap-1.5 text-[13px] font-semibold text-green-700"
                  >
                    <CheckCircle2 size={14} aria-hidden />
                    <span className="hidden sm:inline">Enregistrée</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || policy.acceptedTypes.length === 0}
                  className={BTN_PRIMARY}
                >
                  {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
                  {saving ? "Enregistrement" : "Enregistrer"}
                </button>
              </div>
            }
          />

          <span
            className={`-mt-4 mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              isPolicyConfigured ? "bg-green-50 text-green-800" : "bg-page text-body"
            }`}
          >
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${isPolicyConfigured ? "bg-green-600" : "bg-faint"}`}
            />
            {isPolicyConfigured ? "Politique active" : "Non configurée"}
          </span>
        </div>
      </div>

      {/* ── Bannière d'erreur ── */}
      {error && (
        <div className="px-4 pt-4 sm:px-8">
          <div className="max-w-5xl">
            <Notice tone="danger" icon={AlertCircle} title="Enregistrement impossible">
              {error}
            </Notice>
          </div>
        </div>
      )}

      {/* ── Contenu principal ── */}
      <div className="flex max-w-5xl flex-col items-start gap-6 px-4 py-4 sm:px-8 sm:py-6 lg:flex-row">

        {/* ─── Colonne principale ─── */}
        <div className="flex-1 min-w-0 space-y-4 w-full">

          {/* 1 — Ce que vous acceptez */}
          <SectionCard
            title="Ce que vous acceptez"
            description="Choisissez les solutions que vous proposez à vos clients en cas de problème."
            icon={RefreshCw}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {
                  value: "EXCHANGE",
                  Icon: RefreshCw,
                  label: "Échange",
                  desc: "Remplacement par un nouveau produit",
                },
                {
                  value: "REFUND",
                  Icon: CreditCard,
                  label: "Remboursement",
                  desc: "Remboursement du montant payé",
                },
                {
                  value: "REPAIR",
                  Icon: Wrench,
                  label: "Réparation",
                  desc: "Remise en état et renvoi",
                },
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
                    className={`p-4 rounded-control border text-left transition-all ${
                      active
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-surface hover:border-line"
                    } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Icon size={13} className={active ? "text-brand-ink" : "text-faint"} />
                      {active && <Check size={11} strokeWidth={3} className="text-brand-ink" />}
                    </div>
                    <p className={`text-xs font-semibold ${active ? "text-brand-ink" : "text-ink"}`}>
                      {label}
                    </p>
                    <p className="text-xs text-body mt-0.5">{desc}</p>
                  </button>
                );
              })}
            </div>
            {policy.acceptedTypes.length === 0 && (
              <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Sélectionnez au moins une option pour pouvoir enregistrer.
              </p>
            )}
          </SectionCard>

          {/* 2 — Délai de retour */}
          <SectionCard
            title="Délai de retour"
            description="Combien de temps vos clients ont-ils pour déposer une demande après réception ?"
            icon={Clock}
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-48">
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Nombre de jours
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={policy.maxClaimDays}
                    onChange={(e) => {
                      const v = Math.min(90, Math.max(1, parseInt(e.target.value) || 1));
                      set("maxClaimDays", v);
                    }}
                    className="w-24 px-3 py-2 text-sm font-semibold text-ink border border-line rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand focus-visible:border-brand tabular-nums"
                  />
                  <span className="text-sm text-body">jours après réception</span>
                </div>
                <p className="text-xs text-faint mt-2">Entre 1 et 90 jours.</p>
              </div>
              <div className="shrink-0 px-4 py-3 bg-brand-soft border border-brand/30 rounded-control text-center min-w-28">
                <p className="text-2xl font-bold text-brand-ink tabular-nums leading-none">
                  {policy.maxClaimDays}
                </p>
                <p className="text-xs text-brand-ink mt-1">
                  jour{policy.maxClaimDays > 1 ? "s" : ""} accordé{policy.maxClaimDays > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* 3 — Qui prend les décisions */}
          <SectionCard
            title="Qui prend les décisions ?"
            description="Choisissez si vous souhaitez valider les demandes vous-même ou les laisser traiter automatiquement."
            icon={Users}
          >
            <div className="space-y-2">
              {([
                {
                  mode: "MANUAL" as const,
                  Icon: Users,
                  label: "Je valide chaque demande",
                  desc: "Chaque retour vous est soumis avant traitement. Flowmerce vous propose une décision — vous l'acceptez, la modifiez ou la refusez.",
                  badge: undefined as string | undefined,
                },
                {
                  mode: "AI_AUTO" as const,
                  Icon: Cpu,
                  label: "Décisions automatiques",
                  desc: "Flowmerce traite les demandes selon vos règles, sans que vous ayez à intervenir. Idéal si vous gérez un volume important.",
                  badge: "Recommandé" as string | undefined,
                },
              ]).map(({ mode, Icon, label, desc, badge }) => (
                <label
                  key={mode}
                  className={`flex items-start gap-3 p-3.5 rounded-control border cursor-pointer transition-all ${
                    policy.validationMode === mode
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="validationMode"
                    value={mode}
                    checked={policy.validationMode === mode}
                    onChange={() => set("validationMode", mode)}
                    className="mt-0.5 accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  <Icon
                    size={14}
                    className={`shrink-0 mt-0.5 ${
                      policy.validationMode === mode ? "text-brand-ink" : "text-faint"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm font-medium ${
                          policy.validationMode === mode ? "text-brand-ink" : "text-ink"
                        }`}
                      >
                        {label}
                      </span>
                      {badge && (
                        <span className="text-xs font-semibold bg-brand text-white px-2 py-0.5 rounded">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-body mt-0.5">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {policy.validationMode === "MANUAL" && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-control">
                <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  En mode manuel, vous recevez une notification à chaque demande. La décision finale vous appartient toujours.
                </p>
              </div>
            )}
          </SectionCard>

          {/* 4 — Protection contre les abus */}
          <SectionCard
            title="Protection contre les abus"
            description="À quel point souhaitez-vous filtrer les demandes de retour inhabituelles ?"
            icon={ShieldCheck}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FRAUD_LEVELS.map((level) => {
                const active = currentFraudLevel === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => set("fraudScoreThreshold", level.threshold)}
                    className={`p-4 rounded-control border text-left transition-all relative ${
                      active
                        ? "border-brand bg-brand-soft"
                        : "border-line bg-surface hover:border-line"
                    } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
                  >
                    {level.badge ? (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold bg-brand text-white px-1.5 py-0.5 rounded">
                        {level.badge}
                      </span>
                    ) : active ? (
                      <Check size={11} strokeWidth={3} className="absolute top-2 right-2 text-brand-ink" />
                    ) : null}
                    <p className={`text-xs font-semibold mb-1 ${active ? "text-brand-ink" : "text-ink"}`}>
                      {level.label}
                    </p>
                    <p className="text-xs text-body leading-relaxed">{level.tagline}</p>
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-green-700 flex items-start gap-1">
                        <Check size={10} strokeWidth={3} className="shrink-0 mt-0.5" />
                        {level.impact}
                      </p>
                      {level.warning && (
                        <p className="text-xs text-amber-600 flex items-start gap-1">
                          <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                          {level.warning}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* 5 — Seuil de retours suspects */}
          <SectionCard
            title="Seuil de détection de fraude"
            description="Après combien de retours d'un même client le système doit-il signaler une suspicion de fraude ?"
            icon={ShieldCheck}
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-48">
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Nombre de retours déclenchant l'alerte
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={policy.fraudReturnThreshold}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                      set("fraudReturnThreshold", v);
                    }}
                    className="w-24 px-3 py-2 text-sm font-semibold text-ink border border-line rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand focus-visible:border-brand tabular-nums"
                  />
                  <span className="text-sm text-body">retours par client</span>
                </div>
                <p className="text-xs text-faint mt-2">
                  Par défaut : 4 retours. Un client atteignant ce seuil sera automatiquement marqué comme suspect.
                </p>
              </div>
              <div className="shrink-0 px-4 py-3 bg-red-50 border border-red-100 rounded-control text-center min-w-28">
                <p className="text-2xl font-bold text-red-500 tabular-nums leading-none">
                  {policy.fraudReturnThreshold}
                </p>
                <p className="text-xs text-red-400 mt-1">retour{policy.fraudReturnThreshold > 1 ? "s" : ""} max</p>
              </div>
            </div>
          </SectionCard>

        </div>

        {/* ─── Colonne droite : résumé sticky ─── */}
        <div className="w-full lg:w-60 lg:shrink-0">
          <div className="lg:sticky lg:top-6 space-y-3">

            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="text-xs font-semibold text-body uppercase tracking-wider">
                  Récapitulatif
                </p>
              </div>
              <div className="divide-y divide-line">
                {summaryRows.map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2.5 px-4 py-3">
                    <Icon size={12} className="text-faint shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-faint">{label}</p>
                      <p className="text-xs font-medium text-ink mt-0.5 wrap-break-word leading-relaxed">
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || policy.acceptedTypes.length === 0}
              className={`${BTN_PRIMARY} w-full`}
            >
              {saving && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {saving ? "Enregistrement" : "Enregistrer"}
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
