"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SUGGESTED_CATEGORIES = [
  { value: "Electronics",  label: "Électronique",   icon: "💻" },
  { value: "Clothing",     label: "Vêtements",      icon: "👗" },
  { value: "Shoes",        label: "Chaussures",     icon: "👟" },
  { value: "Beauty",       label: "Beauté",         icon: "💄" },
  { value: "Appliances",   label: "Électroménager", icon: "🏠" },
  { value: "Books",        label: "Livres",         icon: "📚" },
  { value: "Toys",         label: "Jouets",         icon: "🧸" },
  { value: "Sports",       label: "Sport",          icon: "⚽" },
  { value: "Home",         label: "Maison",         icon: "🛋️" },
  { value: "Food",         label: "Alimentation",   icon: "🍎" },
];

type Step = 1 | 2;

const STEPS = [
  { num: 1, label: "Entreprise", icon: "🏢" },
  { num: 2, label: "Catégories", icon: "🏷️" },
];

export default function SetupVendorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [step, setStep]       = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const [form, setForm] = useState({
    companyName: "",
    siret:       "",
    phone:       "",
    address:     "",
    website:     "",
  });

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [customInput, setCustomInput]               = useState("");

  // Rediriger si pas ADMIN ou pas connecté
  useEffect(() => {
    if (status === "loading") return;
    const user = session?.user as any;
    if (!session || user?.role !== "ADMIN") router.replace("/dashboard");
  }, [session, status, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const toggleCategory = (val: string) =>
    setSelectedCategories((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
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
      return (
        form.companyName.trim().length >= 2 &&
        form.phone.trim().length >= 8 &&
        form.address.trim().length >= 5
      );
    if (step === 2) return selectedCategories.length >= 1;
    return false;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vendors/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, categories: selectedCategories }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        return;
      }
      // Succès → retour au dashboard (le token JWT sera mis à jour à la prochaine session)
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-sm">Chargement...</div>
      </div>
    );
  }

  const user = session?.user as any;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-indigo-700 tracking-tight">Flowmerce</span>
          </Link>
          <h2 className="text-xl font-semibold text-gray-800 mt-3">Créer mon profil vendeur</h2>
          <p className="text-gray-500 text-sm mt-1">
            Connecté en tant qu&apos;admin — <span className="font-medium text-indigo-600">{user?.name}</span>
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.num
                    ? "bg-green-500 text-white"
                    : step === s.num
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                    : "bg-gray-200 text-gray-500"
                }`}>
                  {step > s.num ? "✓" : s.icon}
                </div>
                <span className={`text-xs mt-1 font-medium ${step === s.num ? "text-indigo-600" : "text-gray-400"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-16 mx-2 mb-4 transition-all ${step > s.num ? "bg-green-400" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-5 text-sm flex items-start gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Étape 1 : Entreprise ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Informations entreprise
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de l&apos;entreprise <span className="text-red-500">*</span>
                  </label>
                  <input name="companyName" type="text" value={form.companyName} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ma Boutique" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SIRET</label>
                  <input name="siret" type="text" value={form.siret} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="12345678901234" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone <span className="text-red-500">*</span>
                  </label>
                  <input name="phone" type="tel" value={form.phone} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="06 00 00 00 00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site web</label>
                  <input name="website" type="url" value={form.website} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse <span className="text-red-500">*</span>
                </label>
                <input name="address" type="text" value={form.address} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="123 rue de la Paix, 75001 Paris" />
              </div>
            </div>
          )}

          {/* ── Étape 2 : Catégories ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Catégories de vente
                </p>
                <p className="text-xs text-gray-400">
                  Sélectionnez les catégories de produits que vous vendez.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTED_CATEGORIES.map((cat) => {
                  const active = selectedCategories.includes(cat.value);
                  return (
                    <button key={cat.value} type="button" onClick={() => toggleCategory(cat.value)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                        active
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:bg-gray-50"
                      }`}>
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-xs font-medium">{cat.label}</span>
                      {active && <span className="ml-auto text-indigo-500 text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Ajouter une catégorie personnalisée</p>
                <div className="flex gap-2">
                  <input type="text" value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomCategory(); } }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Ex: Bijoux, Animaux, Auto..." />
                  <button type="button" onClick={addCustomCategory} disabled={!customInput.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition">
                    + Ajouter
                  </button>
                </div>
              </div>
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedCategories.map((cat) => {
                    const suggested = SUGGESTED_CATEGORIES.find((s) => s.value === cat);
                    return (
                      <span key={cat} className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full">
                        {suggested?.icon ?? "🏷️"} {suggested?.label ?? cat}
                        <button type="button" onClick={() => removeCategory(cat)}
                          className="ml-1 text-indigo-400 hover:text-indigo-700 transition">×</button>
                      </span>
                    );
                  })}
                </div>
              )}
              {selectedCategories.length === 0 && (
                <p className="text-xs text-red-500">⚠️ Sélectionnez au moins une catégorie</p>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 border-2 border-gray-300 text-gray-600 py-3 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                ← Retour
              </button>
            )}
            {step < 2 ? (
              <button type="button" onClick={() => setStep(2)} disabled={!canGoNext()}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition shadow-sm">
                Suivant →
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading || !canGoNext()}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition shadow-sm">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Création...
                  </span>
                ) : "✅ Créer mon profil vendeur"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          <Link href="/dashboard" className="text-indigo-600 font-medium hover:underline">
            ← Retour au dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}