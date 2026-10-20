"use client";

// On the organizer's pages: use the look of the open event.
// (Guest pages, the phone seat finder and RSVP, set it from their own event.)
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { applyBrand } from "@/lib/useBrand";

export function BrandSync() {
  const path = usePathname();
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authenticated") return;
    if (path?.startsWith("/seat-scanning") || path?.startsWith("/rsvp")) return;
    fetch("/api/events")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) return;
        const ev = (j.events as { id: string; brand?: string }[]).find((e) => e.id === j.activeId);
        applyBrand(ev?.brand === "vip" ? "vip" : "seating4u");
      })
      .catch(() => undefined);
  }, [path, status]);
  return null;
}
