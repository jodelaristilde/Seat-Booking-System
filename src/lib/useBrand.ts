"use client";

// The look of the page: Seating4U, or VIPService4U for nightclub VIP events.
// applyBrand() sets <html data-brand="vip">; the colours follow in globals.css
// and <BrandLogo/> swaps the logo.
import { useEffect, useState } from "react";

export type Brand = "seating4u" | "vip";

export function applyBrand(brand: Brand | null | undefined) {
  if (typeof document === "undefined") return;
  const b: Brand = brand === "vip" ? "vip" : "seating4u";
  if (b === "vip") document.documentElement.dataset.brand = "vip";
  else delete document.documentElement.dataset.brand;
  document.title = b === "vip" ? "VIPService4U" : "Seating4U";
  window.dispatchEvent(new Event("seating4u:brand"));
}

export function useBrand(): Brand {
  const [b, setB] = useState<Brand>("seating4u");
  useEffect(() => {
    const read = () => setB(document.documentElement.dataset.brand === "vip" ? "vip" : "seating4u");
    read();
    window.addEventListener("seating4u:brand", read);
    return () => window.removeEventListener("seating4u:brand", read);
  }, []);
  return b;
}
