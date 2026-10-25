"use client";

import { useBrand } from "@/lib/useBrand";

// The Seating4U logo, or the VIPService4U logo for nightclub VIP events
// guest: a guest page (phone seat finder): always the Seating4U logo
export function BrandLogo({ className, width, height, style, guest }: { className?: string; width?: number; height?: number; style?: React.CSSProperties; guest?: boolean }) {
  const b = useBrand();
  const brand = guest ? "seating4u" : b;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand === "vip" ? "/vip4u-logo-gold.png" : "/logo.png"}
      alt={brand === "vip" ? "VIPService4U" : "Seating4U"}
      width={width}
      height={height}
      className={className}
      style={{ objectFit: "contain", ...style }}
      draggable={false}
    />
  );
}
