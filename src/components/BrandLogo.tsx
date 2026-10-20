"use client";

import { useBrand } from "@/lib/useBrand";

// The Seating4U logo, or the VIPService4U logo for nightclub VIP events
export function BrandLogo({ className, width, height, style }: { className?: string; width?: number; height?: number; style?: React.CSSProperties }) {
  const brand = useBrand();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand === "vip" ? "/vip4u-logo.png" : "/logo.svg"}
      alt={brand === "vip" ? "VIPService4U" : "Seating4U"}
      width={width}
      height={height}
      className={className}
      style={{ objectFit: "contain", ...style }}
      draggable={false}
    />
  );
}
