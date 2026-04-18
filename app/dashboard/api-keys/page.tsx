"use client";

import { useEffect, useState } from "react";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";


type ApiKey = {
  id: string;
  name: string;
  key: string;          // masque (préfixe…) — le raw n'est plus jamais resservi
  keyPrefix?: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Raw keys révélées uniquement à l'instant de leur création (one-shot).
  // Perdues au reload : la DB ne stocke qu'un hash.
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const fetchKeys = async () => {
    const res = await fetch("/api/api-keys");
    const data = await res.json();
    setKeys(data.keys || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError("");

    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur lors de la création");
    } else {
      // data.key.key contient le RAW (one-shot reveal). On le garde en
      // mémoire locale puis on stocke le masque côté liste.
      const rawKey: string = data.key.key;
      setRevealed((prev) => ({ ...prev, [data.key.id]: rawKey }));
      const masked = data.key.keyPrefix ? `${data.key.keyPrefix}…` : "••••••••";
      setKeys((prev) => [{ ...data.key, key: masked }, ...prev]);
      setNewKeyName("");
      setShowForm(false);
    }
    setCreating(false);
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Révoquer cette clé API ? Cette action est irréversible.")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const copyKey = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-8 max-w-3xl">
      <VendorAccessGuard />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clés API</h1>
          <p className="text-gray-500 mt-1">Gérez les clés d&apos;accès à l&apos;API Flomerce</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + Nouvelle clé
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createKey}
          className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6"
        >
          <h2 className="font-semibold text-gray-800 mb-4">Créer une clé API</h2>
          {error && (
            <p className="text-red-600 text-sm mb-3">{error}</p>
          )}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Nom de la clé (ex: Production, Test...)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "..." : "Créer"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-gray-500 hover:text-gray-700 px-2"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Chargement...</div>
      ) : keys.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center border border-dashed border-gray-300">
          <div className="text-4xl mb-3">🔑</div>
          <p className="text-gray-500">Aucune clé API. Créez votre première clé.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {keys.map((key) => (
            <div
              key={key.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-800">{key.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Créée le {new Date(key.createdAt).toLocaleDateString("fr-FR")}
                    {key.lastUsedAt &&
                      ` · Dernière utilisation : ${new Date(key.lastUsedAt).toLocaleDateString("fr-FR")}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                >
                  Révoquer
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-50 text-gray-700 text-xs px-3 py-2 rounded-lg font-mono truncate border border-gray-200">
                  {revealed[key.id] ?? key.key}
                </code>
                {revealed[key.id] && (
                  <button
                    onClick={() => copyKey(revealed[key.id], key.id)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {copiedId === key.id ? "Copié ✓" : "Copier"}
                  </button>
                )}
              </div>
              {revealed[key.id] && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ Copiez cette clé maintenant — elle ne sera plus jamais affichée.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-blue-50 rounded-xl p-5 border border-blue-100">
        <h3 className="font-semibold text-blue-800 mb-2">Comment utiliser votre clé API ?</h3>
        <p className="text-sm text-blue-700 mb-3">
          Ajoutez votre clé dans le header de chaque requête :
        </p>
        <code className="block bg-blue-900 text-blue-100 text-xs px-4 py-3 rounded-lg font-mono">
          Authorization: Bearer flk_votre_cle_api
        </code>
      </div>
    </div>
    
  );
}
