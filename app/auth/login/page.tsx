"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction } from "./actions";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react";

const INPUT = "w-full border border-gray-200 rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.set("email",    form.email);
    fd.set("password", form.password);
    const result = await loginAction(fd);

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 sm:p-6">

      {/* Card */}
      <div className="w-full max-w-4xl bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">

        {/* Left panel — hidden on mobile */}
        <div className="hidden sm:flex w-64 md:w-72 bg-indigo-700 p-8 flex-col shrink-0">
          <Link href="/" className="text-white font-bold tracking-tight text-base mb-10 block">
            Flowmerce
          </Link>

          <div className="flex flex-col gap-5 flex-1">
            <div>
              <p className="text-white font-semibold text-lg leading-tight">Espace vendeur</p>
              <p className="text-indigo-300 text-base mt-2 leading-relaxed">
                Gerez vos reclamations, configurez votre politique de retours et pilotez votre activite.
              </p>
            </div>

            <div className="flex flex-col gap-3 mt-2">
              {[
                "Decisions automatiques par IA",
                "Detection de fraude en temps reel",
                "Politique de retours personnalisable",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-indigo-200 text-sm leading-snug">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <div className="h-px bg-indigo-600 mb-4" />
            <p className="text-sm text-indigo-300">
              Pas encore vendeur ?{" "}
              <Link href="/auth/register" className="text-white font-medium hover:underline">
                Creer un compte
              </Link>
            </p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 p-6 sm:p-10 md:p-12 flex flex-col justify-center">

          <div className="mb-8">
            <p className="text-sm font-semibold text-indigo-600 uppercase tracking-wider mb-1">
              Connexion
            </p>
            <h1 className="text-xl font-semibold text-gray-900">Bienvenue</h1>
            <p className="text-base text-gray-500 mt-0.5">Accedez a votre espace vendeur</p>
          </div>

          {registered && (
            <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 text-green-700 px-3.5 py-3 rounded-lg mb-6 text-base">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>Compte cree. Votre inscription est en cours de verification.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 px-3.5 py-3 rounded-lg mb-6 text-base">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
                  placeholder="Mohammed@exemple.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Mot de passe</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg pl-10 pr-10 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connexion...
                </span>
              ) : "Se connecter"}
            </button>
          </form>
        </div>
      </div>

      <p className="text-sm sm:text-base text-gray-500 mt-4 sm:mt-5 text-center">
        Pas encore de compte ?{" "}
        <Link href="/auth/register" className="text-indigo-600 font-medium hover:text-indigo-800 transition-colors">
          S&apos;inscrire
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
