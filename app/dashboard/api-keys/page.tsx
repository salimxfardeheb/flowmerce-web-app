"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { VendorAccessGuard } from "@/components/vendor/VendorAccessGuard";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  Card,
  CardTitle,
  EmptyState,
  FIELD,
  FOCUS,
  Notice,
  PageHeader,
  Skeleton,
} from "@/components/dashboard/ui";
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

const MAX_KEYS = 5;

type ApiKey = {
  id: string;
  name: string;
  key: string;
  keyPrefix?: string | null;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

const fmtDate = (v: string) => new Date(v).toLocaleDateString("fr-FR");

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const fetchKeys = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chargement impossible");
      setKeys(data.keys || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const atLimit = keys.length >= MAX_KEYS;

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;

    if (keys.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
      setError("Une clé porte déjà ce nom.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Création impossible.");
        return;
      }
      const rawKey: string = data.key.key;
      setRevealed((prev) => ({ ...prev, [data.key.id]: rawKey }));
      const masked = data.key.keyPrefix ? `${data.key.keyPrefix}…` : "••••••••";
      setKeys((prev) => [{ ...data.key, key: masked }, ...prev]);
      setNewKeyName("");
      setShowForm(false);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string, name: string) => {
    if (!confirm(`Révoquer la clé « ${name} » ? Toute intégration qui l’utilise cessera immédiatement de fonctionner.`))
      return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const copyKey = async (key: string, id: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="w-full max-w-3xl p-5 sm:p-10">
      <VendorAccessGuard />

      <PageHeader
        title="Clés API"
        subtitle={`${keys.length} clé${keys.length !== 1 ? "s" : ""} active${
          keys.length !== 1 ? "s" : ""
        } sur ${MAX_KEYS}.`}
        action={
          !showForm && (
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setError("");
              }}
              disabled={atLimit}
              title={atLimit ? `Maximum ${MAX_KEYS} clés actives` : undefined}
              className={BTN_PRIMARY}
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
              Nouvelle clé
            </button>
          )
        }
      />

      <div className="space-y-5">
        {atLimit && !showForm && (
          <Notice tone="warning" icon={AlertTriangle} title={`Limite de ${MAX_KEYS} clés atteinte`}>
            Révoquez une clé existante pour pouvoir en créer une nouvelle.
          </Notice>
        )}

        {showForm && (
          <Card>
            <CardTitle
              aside={
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                  }}
                  aria-label="Fermer le formulaire"
                  className={`rounded-control p-1 text-faint transition-colors hover:text-ink ${FOCUS}`}
                >
                  <X size={16} aria-hidden />
                </button>
              }
            >
              Créer une clé
            </CardTitle>

            <form onSubmit={createKey} className="space-y-3">
              <div>
                <label htmlFor="key-name" className="mb-2 block text-[13px] font-semibold text-ink">
                  Nom de la clé
                </label>
                <div className="flex gap-2">
                  <input
                    id="key-name"
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className={FIELD}
                    required
                    autoFocus
                    aria-describedby="key-name-hint"
                  />
                  <button type="submit" disabled={creating} className={`${BTN_PRIMARY} shrink-0`}>
                    {creating && <Loader2 size={15} className="animate-spin" aria-hidden />}
                    {creating ? "Création" : "Créer"}
                  </button>
                </div>
                <p id="key-name-hint" className="mt-1.5 text-[12px] text-faint">
                  Un nom qui identifie l’environnement, par exemple « Production » ou « Préprod ».
                </p>
              </div>

              {error && (
                <p role="alert" className="text-[13px] font-medium text-red-700">
                  {error}
                </p>
              )}
            </form>
          </Card>
        )}

        {loading ? (
          <Card className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-48" />
          </Card>
        ) : loadError ? (
          <Notice tone="danger" icon={AlertTriangle} title="Chargement impossible" action={
            <button type="button" onClick={fetchKeys} className={BTN_GHOST}>
              Réessayer
            </button>
          }>
            {loadError}
          </Notice>
        ) : keys.length === 0 ? (
          <Card padded={false}>
            <EmptyState
              icon={Key}
              title="Aucune clé API"
              hint="La clé relie vos commandes à Flowmerce. Créez-en une, puis transmettez-la à votre développeur."
              action={
                <button type="button" onClick={() => setShowForm(true)} className={BTN_PRIMARY}>
                  <Plus size={15} strokeWidth={2} aria-hidden />
                  Créer ma première clé
                </button>
              }
            />
          </Card>
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-line list-none m-0 p-0">
              {keys.map((key) => (
                <li key={key.id} className="p-6">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-ink">{key.name}</p>
                      <p className="mt-0.5 text-[12px] text-body">
                        Créée le {fmtDate(key.createdAt)}
                        {key.lastUsedAt
                          ? ` · utilisée le ${fmtDate(key.lastUsedAt)}`
                          : " · jamais utilisée"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeKey(key.id, key.name)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-control px-2 py-1 text-[12px] font-semibold text-red-700 transition-colors hover:bg-red-50 ${FOCUS}`}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                      Révoquer
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-control border border-line bg-page px-3 py-2 font-mono text-[12px] text-ink">
                      {revealed[key.id] ?? key.key}
                    </code>
                    {revealed[key.id] && (
                      <button
                        type="button"
                        onClick={() => copyKey(revealed[key.id], key.id)}
                        className={`${BTN_GHOST} shrink-0 px-3 py-2`}
                      >
                        {copiedId === key.id ? (
                          <>
                            <Check size={14} className="text-green-700" aria-hidden />
                            Copié
                          </>
                        ) : (
                          <>
                            <Copy size={14} aria-hidden />
                            Copier
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {revealed[key.id] && (
                    <p
                      role="status"
                      className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-amber-800"
                    >
                      <AlertTriangle size={14} className="mt-px shrink-0" aria-hidden />
                      Copiez cette clé maintenant : elle ne sera plus jamais affichée.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardTitle>Utilisation</CardTitle>
          <p className="mb-3 text-[13px] text-body">
            Votre serveur ajoute la clé dans l’en-tête de chaque requête. Elle ne doit jamais
            apparaître côté navigateur.
          </p>
          <code className="block overflow-x-auto rounded-control bg-deep px-4 py-3 font-mono text-[12px] text-slate-200">
            Authorization: Bearer flk_votre_cle_api
          </code>
          <Link
            href="/docs/developpeurs"
            className={`mt-3 inline-flex rounded-control text-[12px] font-semibold text-brand-ink hover:underline ${FOCUS}`}
          >
            Documentation technique
          </Link>
        </Card>
      </div>
    </div>
  );
}
