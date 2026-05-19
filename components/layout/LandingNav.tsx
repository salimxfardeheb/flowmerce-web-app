"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";

const DRAWER_LINK_CLS =
  "block px-3 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors no-underline";

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={140} height={28} priority />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <a href="#features" className="hover:text-gray-900 transition-colors">Fonctionnalites</a>
            <a href="#how-it-works" className="hover:text-gray-900 transition-colors">Comment ca marche</a>
            <a href="/docs" className="hover:text-gray-900 transition-colors">Documentation</a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <Link href="/auth/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors px-3 py-2">
              Se connecter
            </Link>
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
            >
              Commencer gratuitement
            </Link>
          </div>

          {/* Mobile: CTA + hamburger */}
          <div className="flex md:hidden items-center gap-2 shrink-0">
            <Link
              href="/auth/register"
              className="bg-indigo-600 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
            >
              Commencer
            </Link>
            <button
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Menu size={20} />
            </button>
          </div>

        </div>
      </nav>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-in-out md:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100 shrink-0">
          <Image src="/logos/logo-lockup.svg" alt="Flowmerce" width={120} height={24} />
          <button
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Links */}
        <div className="flex flex-col px-4 py-3 gap-0.5 flex-1">
          <a href="#features" onClick={() => setOpen(false)} className={DRAWER_LINK_CLS}>
            Fonctionnalites
          </a>
          <a href="#how-it-works" onClick={() => setOpen(false)} className={DRAWER_LINK_CLS}>
            Comment ca marche
          </a>
          <a href="/docs" onClick={() => setOpen(false)} className={DRAWER_LINK_CLS}>
            Documentation
          </a>
        </div>

        {/* CTA */}
        <div className="px-4 pb-8 pt-4 flex flex-col gap-2 border-t border-gray-100 shrink-0">
          <Link
            href="/auth/register"
            onClick={() => setOpen(false)}
            className="w-full bg-indigo-600 text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-indigo-700 transition-colors text-center shadow-sm"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/auth/login"
            onClick={() => setOpen(false)}
            className="w-full text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 px-4 py-3 rounded-lg transition-colors text-center border border-gray-200"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </>
  );
}
