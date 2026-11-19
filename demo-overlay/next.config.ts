// DEMO OVERLAY (replaces the website's next.config.ts on sync).
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Avatars are local SVGs and product photos come straight from Unsplash;
    // no optimisation needed for a demo.
    unoptimized: true,
  },
  async headers() {
    // The demo is never indexed by search engines.
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
