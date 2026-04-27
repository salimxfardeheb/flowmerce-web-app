"use client";

import { useEffect, useState } from "react";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";
import { Key, Copy, Check, AlertTriangle, Trash2, Plus, X } from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  key: string;
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

    const isDuplicate = keys.some(
      (k) => k.name.toLowerCase() === newKeyName.trim().toLowerCase()
    );
    if (isDuplicate) {
      setError("Une clé avec ce nom existe déjà.");
      return;
    }

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
    <div className="px-8 py-6 max-w-3xl">
      <VendorAccessGuard />

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clés API</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gérez les clés d&apos;accès à l&apos;API Flomerce.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(""); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouvelle clé
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Créer une clé API</h2>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-600 mb-3">{error}</p>
          )}
          <form onSubmit={createKey} className="flex gap-3">
            <input
              type="text"
              placeholder="Nom de la clé (ex : Production, Test…)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {creating ? "Création…" : "Créer"}
            </button>
          </form>
        </div>
      )}

      {/* Keys list */}
      {loading ? (
        <div className="text-sm text-gray-400">Chargement…</div>
      ) : keys.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 flex flex-col items-center">
          <Key className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">Aucune clé API</p>
          <p className="text-xs text-gray-400 mt-1">Créez votre première clé pour commencer.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {keys.map((key) => (
            <div key={key.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{key.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Créée le {new Date(key.createdAt).toLocaleDateString("fr-FR")}
                    {key.lastUsedAt &&
                      ` · Dernière utilisation : ${new Date(key.lastUsedAt).toLocaleDateString("fr-FR")}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeKey(key.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
                    className="inline-flex items-center gap-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {copiedId === key.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        Copié
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copier
                      </>
                    )}
                  </button>
                )}
              </div>

              {revealed[key.id] && (
                <div className="flex items-center gap-1.5 mt-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-600">
                    Copiez cette clé maintenant — elle ne sera plus jamais affichée.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Usage guide */}
      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Utilisation</h3>
        <p className="text-xs text-gray-500 mb-3">
          Ajoutez votre clé dans le header de chaque requête :
        </p>
        <code className="block bg-indigo-500 text-gray-100 text-xs px-4 py-3 rounded-lg font-mono">
          Authorization: Bearer flk_votre_cle_api
        </code>
      </div>
    </div>
  );
}
