"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Plus, X } from "lucide-react";
import {
  AuthShell,
  AUTH_BTN_GHOST,
  AUTH_BTN_PRIMARY,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_LINK,
} from "@/components/auth/AuthShell";

const SUGGESTED_CATEGORIES = [
  { value: "Electronics", label: "Électronique" },
  { value: "Clothing", label: "Vêtements" },
  { value: "Shoes", label: "Chaussures" },
  { value: "Beauty", label: "Beauté" },
  { value: "Appliances", label: "Électroménager" },
  { value: "Books", label: "Livres" },
  { value: "Toys", label: "Jouets" },
  { value: "Sports", label: "Sport" },
  { value: "Home", label: "Maison" },
  { value: "Food", label: "Alimentation" },
];

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1 as Step, label: "Compte", desc: "Vos identifiants de connexion." },
  { num: 2 as Step, label: "Entreprise", desc: "Les informations de votre société." },
  { num: 3 as Step, label: "Catégories", desc: "Les produits que vous commercialisez." },
];

function RegisterAside({ step }: { step: Step }) {
  return (
    <>
      <nav aria-label="Progression de l’inscription">
        <ol className="flex flex-col gap-5 list-none p-0 m-0">
          {STEPS.map((s) => {
            const done = step > s.num;
            const active = step === s.num;
            return (
              <li key={s.num} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                    done
                      ? "bg-green-400 text-deep"
                      : active
                        ? "bg-white text-deep"
                        : "bg-white/15 text-white/60"
                  }`}
                >
                  {done ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <span className="text-[11px] font-bold leading-none">{s.num}</span>
                  )}
                </span>
                <span>
                  <span
                    className={`block text-[14px] font-semibold leading-none ${
                      active ? "text-white" : done ? "text-white/70" : "text-white/50"
                    }`}
                  >
                    {s.label}
                    {done && <span className="sr-only"> (terminée)</span>}
                    {active && <span className="sr-only"> (en cours)</span>}
                  </span>
                  {active && (
                    <span className="mt-1 block text-[13px] leading-snug text-white/70">
                      {s.desc}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-auto pt-8">
        <div className="mb-4 h-px bg-white/15" />
        <p className="mb-2 text-[13px] text-white/70">Étape {step} sur 3</p>
        <div
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label="Progression de l’inscription"
          className="h-1 overflow-hidden rounded-full bg-white/15"
        >
          <div
            className="h-full rounded-full bg-white/60 transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    companyName: "",
    phone: "",
    address: "",
    website: "",
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const toggleCategory = (val: string) =>
    setSelectedCategories((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val],
    );

  const addCustomCategory = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selectedCategories.includes(trimmed)) return;
    setSelectedCategories((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCategory = (val: string) =>
    setSelectedCategories((prev) => prev.filter((c) => c !== val));

  const canGoNext = (): boolean => {
    if (step === 1)
      return form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 8;
    if (step === 2) return form.companyName.trim().length >= 2 && form.phone.trim().length >= 8;
    if (step === 3) return selectedCategories.length >= 1;
    return false;
  };

  const goNext = () => {
    setError("");
    if (step < 3) setStep((s) => (s + 1) as Step);
  };
  const goPrev = () => {
    setError("");
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vendors/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, categories: selectedCategories }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.details?.length > 0
            ? data.details.map((e: { message: string }) => e.message).join(" · ")
            : data.error || "Une erreur est survenue",
        );
        return;
      }
      router.push("/auth/login?registered=true");
    } catch {
      setError("Erreur de connexion au serveur.");
    } finally {
      setLoading(false);
    }
  };

  const currentStep = STEPS.find((s) => s.num === step)!;

  return (
    <AuthShell
      eyebrow={`Étape ${step} sur 3`}
      title={currentStep.label}
      subtitle={currentStep.desc}
      aside={<RegisterAside step={step} />}
      footer={
        <>
          Déjà un compte ?{" "}
          <Link href="/auth/login" className={AUTH_LINK}>
            Se connecter
          </Link>
        </>
      }
    >
      {error && (
        <p
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-control bg-red-50 px-3.5 py-3 text-[13px] text-red-700"
        >
          <AlertCircle size={16} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="name" className={AUTH_LABEL}>
              Nom complet
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              className={AUTH_INPUT}
            />
          </div>
          <div>
            <label htmlFor="email" className={AUTH_LABEL}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className={AUTH_INPUT}
            />
          </div>
          <div>
            <label htmlFor="password" className={AUTH_LABEL}>
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby="password-hint"
                value={form.password}
                onChange={handleChange}
                className={`${AUTH_INPUT} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-control p-1 text-faint transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
            <p
              id="password-hint"
              className={`mt-1.5 text-xs ${
                form.password.length > 0 && form.password.length < 8 ? "text-red-700" : "text-faint"
              }`}
            >
              8 caractères minimum.
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="companyName" className={AUTH_LABEL}>
              Nom de l’entreprise
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              autoComplete="organization"
              value={form.companyName}
              onChange={handleChange}
              className={AUTH_INPUT}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="phone" className={AUTH_LABEL}>
                Téléphone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                value={form.phone}
                onChange={handleChange}
                className={AUTH_INPUT}
              />
            </div>
            <div>
              <label htmlFor="website" className={AUTH_LABEL}>
                Site web <span className="font-normal text-faint">(facultatif)</span>
              </label>
              <input
                id="website"
                name="website"
                type="url"
                autoComplete="url"
                placeholder="https://"
                value={form.website}
                onChange={handleChange}
                className={AUTH_INPUT}
              />
            </div>
          </div>
          <div>
            <label htmlFor="address" className={AUTH_LABEL}>
              Adresse
            </label>
            <input
              id="address"
              name="address"
              type="text"
              required
              autoComplete="street-address"
              value={form.address}
              onChange={handleChange}
              className={AUTH_INPUT}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-5">
          <fieldset className="m-0 border-0 p-0">
            <legend className={AUTH_LABEL}>Vos catégories de produits</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SUGGESTED_CATEGORIES.map((cat) => {
                const active = selectedCategories.includes(cat.value);
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => toggleCategory(cat.value)}
                    aria-pressed={active}
                    className={`relative rounded-control border px-2 py-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      active
                        ? "border-brand bg-brand-soft text-brand-ink"
                        : "border-line text-body hover:border-brand/40"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="custom-category" className={AUTH_LABEL}>
              Autre catégorie
            </label>
            <div className="flex gap-2">
              <input
                id="custom-category"
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomCategory();
                  }
                }}
                className={AUTH_INPUT}
                placeholder="Bijoux, papeterie…"
              />
              <button
                type="button"
                onClick={addCustomCategory}
                disabled={!customInput.trim()}
                aria-label="Ajouter cette catégorie"
                className={`${AUTH_BTN_PRIMARY} shrink-0 px-3.5 py-2.5`}
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>

          {selectedCategories.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 list-none p-0">
              {selectedCategories.map((cat) => {
                const suggested = SUGGESTED_CATEGORIES.find((s) => s.value === cat);
                return (
                  <li
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-ink"
                  >
                    {suggested?.label ?? cat}
                    <button
                      type="button"
                      onClick={() => removeCategory(cat)}
                      aria-label={`Retirer ${suggested?.label ?? cat}`}
                      className="ml-0.5 rounded-full text-brand-ink/60 transition-colors hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-faint">
              Sélectionnez au moins une catégorie pour continuer.
            </p>
          )}
        </div>
      )}

      <div className="mt-8 flex gap-2.5 border-t border-line pt-5">
        {step > 1 && (
          <button type="button" onClick={goPrev} className={AUTH_BTN_GHOST}>
            <ArrowLeft size={15} aria-hidden />
            Retour
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext()}
            className={`${AUTH_BTN_PRIMARY} ml-auto`}
          >
            Continuer
            <ArrowRight size={15} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !canGoNext()}
            className={`${AUTH_BTN_PRIMARY} ml-auto`}
          >
            {loading ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Check size={15} strokeWidth={2.5} aria-hidden />
            )}
            {loading ? "Création en cours" : "Créer mon compte"}
          </button>
        )}
      </div>
    </AuthShell>
  );
}
