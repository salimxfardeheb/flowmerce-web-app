"use client";

/**
 * VendorAccessGuard
 * À placer en haut des pages client du dashboard (api-keys, return-policy).
 * Redirige vers /dashboard si le compte est bloqué.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function VendorAccessGuard() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/vendors/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.noVendor || data.isBlocked) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [router]);

  return null;
}