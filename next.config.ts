import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages people open from a QR code or a link must always be the newest
  // version: phones must never show an old copy.
  async headers() {
    const fresh = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" }];
    return ["/", "/seat-scanning", "/seat-scanning/:path*", "/board", "/live", "/report", "/rsvp", "/login", "/dashboard", "/dashboard/:path*"].map(
      (source) => ({ source, headers: fresh })
    );
  },
};

export default nextConfig;
