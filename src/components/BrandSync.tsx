"use client";

// On the organizer's pages: use the look of the open event.
// Guest pages (phone seat finder, RSVP) set the look from their own event.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { applyBrand } from "@/lib/useBrand";

export function BrandSync() {
  const path = usePathname();
  const { status } = useSession();
  useEffect(() => {
    // guest pages (phone seat finder, RSVP) set the look from their own event
    if (path?.startsWith("/seat-scanning") || path?.startsWith("/rsvp")) return;
    if (path?.startsWith("/login")) {
      applyBrand("seating4u");
      return;
    }
    if (status !== "authenticated") return;
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
