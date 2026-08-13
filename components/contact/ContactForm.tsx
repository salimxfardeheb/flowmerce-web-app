"use client";

import { useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const FIELD = `w-full rounded-control border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus-visible:border-brand ${FOCUS}`;

const LABEL = "block text-[13px] font-semibold text-ink mb-1.5";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const data = Object.fromEntries(new FormData(e.currentTarget));

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? "Envoi impossible. Réessayez dans quelques minutes.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-card border border-line bg-surface p-8 text-center"
      >
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
          <Check size={20} strokeWidth={2.25} aria-hidden />
        </span>
        <h2 className="text-lg font-bold text-ink">Message envoyé</h2>
        <p className="mt-2 text-[14px] text-body leading-relaxed">
          Nous répondons directement à l’adresse que vous avez indiquée, en général
          sous un jour ouvré.
        </p>
      </div>
    );
  }

  const sending = status === "sending";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-card border border-line bg-surface p-6 sm:p-8"
    >
      {/* Piège à bots : invisible à l’écran, ignoré par les lecteurs d’écran. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Ne pas remplir</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={LABEL}>
            Nom
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            disabled={sending}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="email" className={LABEL}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            disabled={sending}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="shop" className={LABEL}>
          Boutique <span className="font-normal text-faint">(facultatif)</span>
        </label>
        <input
          id="shop"
          name="shop"
          type="text"
          maxLength={200}
          autoComplete="organization"
          disabled={sending}
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-faint">
          Le nom ou l’adresse de votre boutique, si vous en avez une.
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor="message" className={LABEL}>
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={20}
          maxLength={4000}
          rows={6}
          disabled={sending}
          className={`${FIELD} resize-y`}
        />
        <p className="mt-1.5 text-xs text-faint">20 caractères minimum.</p>
      </div>

      {status === "error" && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-control bg-red-50 px-3.5 py-3 text-[13px] text-red-700"
        >
          <TriangleAlert size={16} strokeWidth={2} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-control bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-[background-color,transform] hover:bg-brand-dark active:translate-y-px disabled:opacity-60 sm:w-auto ${FOCUS}`}
      >
        {sending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {sending ? "Envoi en cours" : "Envoyer le message"}
      </button>
    </form>
  );
}
