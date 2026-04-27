"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Plus,
  X,
} from "lucide-react";

const SUGGESTED_CATEGORIES = [
  { value: "Electronics",  label: "Electronique"   },
  { value: "Clothing",     label: "Vetements"      },
  { value: "Shoes",        label: "Chaussures"     },
  { value: "Beauty",       label: "Beaute"         },
  { value: "Appliances",   label: "Electromenager" },
  { value: "Books",        label: "Livres"         },
  { value: "Toys",         label: "Jouets"         },
  { value: "Sports",       label: "Sport"          },
  { value: "Home",         label: "Maison"         },
  { value: "Food",         label: "Alimentation"   },
];

type Step = 1 | 2 | 3;

const STEPS = [
  { num: 1 as Step, label: "Compte",      desc: "Vos identifiants de connexion"         },
  { num: 2 as Step, label: "Entreprise",  desc: "Les informations de votre societe"     },
  { num: 3 as Step, label: "Categories",  desc: "Les produits que vous commercialisez"  },
];

const INPUT = "w-full border border-gray-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400";

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
    siret: "",
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

  const toggleCategory = (val: string) => {
    setSelectedCategories((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
  };

  const addCustomCategory = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selectedCategories.includes(trimmed)) return;
    setSelectedCategories((prev) => [...prev, trimmed]);
    setCustomInput("");
  };

  const removeCategory = (val: string) => {
    setSelectedCategories((prev) => prev.filter((c) => c !== val));
  };

  const canGoNext = (): boolean => {
    if (step === 1) return form.name.trim().length >= 2 && form.email.includes("@") && form.password.length >= 8;
    if (step === 2) return form.companyName.trim().length >= 2 && form.phone.trim().length >= 8;
    if (step === 3) return selectedCategories.length >= 1;
    return false;
  };

  const goNext = () => { setError(""); if (step < 3) setStep((s) => (s + 1) as Step); };
  const goPrev = () => { setError(""); if (step > 1) setStep((s) => (s - 1) as Step); };

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
        setError(data.details?.length > 0 ? data.details.map((e: any) => e.message).join(" — ") : data.error || "Une erreur est survenue");
        return;
      }
      router.push("/auth/login?registered=true");
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  const currentStep = STEPS.find((s) => s.num === step)!;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">

      {/* Card */}
      <div className="w-full max-w-4xl bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex">

        {/* Left panel */}
        <div className="w-72 bg-indigo-700 p-8 flex flex-col shrink-0">
          <Link href="/" className="text-white font-bold tracking-tight text-base mb-10 block">
            Flowmerce
          </Link>

          <nav className="flex flex-col gap-5">
            {STEPS.map((s) => {
              const done    = step > s.num;
              const active  = step === s.num;
              return (
                <div key={s.num} className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    done   ? "bg-green-400 text-white" :
                    active ? "bg-white text-indigo-700" :
                             "bg-indigo-600/50 text-indigo-400"
                  }`}>
                    {done
                      ? <Check size={11} strokeWidth={3} />
                      : <span className="text-xs font-bold leading-none">{s.num}</span>
                    }
                  </div>
                  <div>
                    <p className={`text-base font-medium leading-none ${active ? "text-white" : done ? "text-indigo-200" : "text-indigo-400"}`}>
                      {s.label}
                    </p>
                    {active && (
                      <p className="text-sm text-indigo-300 mt-1 leading-snug">{s.desc}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="mt-auto">
            <div className="h-px bg-indigo-600 mb-4" />
            <p className="text-sm text-indigo-300 mb-2">Etape {step} sur 3</p>
            <div className="h-1 bg-indigo-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/50 rounded-full transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 p-12 flex flex-col">

          {/* Step header */}
          <div className="mb-6">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Etape {step} sur 3
            </p>
            <h1 className="text-xl font-semibold text-gray-900">{currentStep.label}</h1>
            <p className="text-base text-gray-500 mt-0.5">{currentStep.desc}</p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-3.5 py-3 rounded-lg mb-5 text-sm">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Etape 1 */}
          {step === 1 && (
            <div className="flex flex-col gap-4 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom complet <span className="text-red-400">*</span>
                </label>
                <input name="name" type="text" required value={form.name} onChange={handleChange}
                  className={INPUT} placeholder="Mohammed ben Mohammed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-red-400">*</span>
                </label>
                <input name="email" type="email" required value={form.email} onChange={handleChange}
                  className={INPUT} placeholder="Mohammed@exemple.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input name="password" type={showPassword ? "text" : "password"} required minLength={8} value={form.password} onChange={handleChange}
                    className={`${INPUT} pr-10`} placeholder="Minimum 8 caracteres" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password.length > 0 && form.password.length < 8 && (
                  <p className="text-xs text-red-500 mt-1.5">Au moins 8 caracteres requis</p>
                )}
              </div>
            </div>
          )}

          {/* Etape 2 */}
          {step === 2 && (
            <div className="flex flex-col gap-4 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom de l&apos;entreprise <span className="text-red-400">*</span>
                  </label>
                  <input name="companyName" type="text" required value={form.companyName} onChange={handleChange}
                    className={INPUT} placeholder="Ma Boutique" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SIRET</label>
                  <input name="siret" type="text" value={form.siret} onChange={handleChange}
                    className={INPUT} placeholder="12345678901234" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Telephone <span className="text-red-400">*</span>
                  </label>
                  <input name="phone" type="tel" required value={form.phone} onChange={handleChange}
                    className={INPUT} placeholder="06 00 00 00 00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Site web</label>
                  <input name="website" type="url" value={form.website} onChange={handleChange}
                    className={INPUT} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse <span className="text-red-400">*</span>
                </label>
                <input name="address" type="text" required value={form.address} onChange={handleChange}
                  className={INPUT} placeholder="123 rue de Mohammed, 31001 Oran" />
              </div>
            </div>
          )}

          {/* Etape 3 */}
          {step === 3 && (
            <div className="flex flex-col gap-4 flex-1">
              <div className="grid grid-cols-3 gap-2">
                {SUGGESTED_CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat.value);
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={`relative flex items-center justify-center px-2 py-3 rounded-lg border text-sm font-medium transition-all ${
                        active
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-gray-50"
                      }`}
                    >
                      {cat.label}
                      {active && (
                        <span className="absolute top-1 right-1 w-3 h-3 bg-indigo-600 rounded-full flex items-center justify-center">
                          <Check size={8} className="text-white" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCategory(); } }}
                  className={INPUT}
                  placeholder="Categorie personnalisee..."
                />
                <button
                  type="button"
                  onClick={addCustomCategory}
                  disabled={!customInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Plus size={14} />
                </button>
              </div>

              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedCategories.map((cat) => {
                    const suggested = SUGGESTED_CATEGORIES.find((s) => s.value === cat);
                    return (
                      <span key={cat} className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-md">
                        {suggested?.label ?? cat}
                        <button type="button" onClick={() => removeCategory(cat)} className="text-indigo-400 hover:text-indigo-700 transition-colors ml-0.5">
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {selectedCategories.length === 0 && (
                <p className="text-xs text-gray-400">Selectionnez au moins une categorie pour continuer.</p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-2.5 mt-8 pt-5 border-t border-gray-100">
            {step > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Retour
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoNext()}
                className="ml-auto inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continuer
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !canGoNext()}
                className="ml-auto inline-flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creation...
                  </>
                ) : (
                  <>
                    <Check size={14} strokeWidth={2.5} />
                    Creer mon compte
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-base text-gray-500 mt-5">
        Deja un compte ?{" "}
        <Link href="/auth/login" className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
