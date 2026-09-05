import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Keep a minimal self-hostable runtime image for deployment validation.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // User notes and content previews are local-only; do not allow
          // browsers to reinterpret downloaded responses as another type.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The app has no supported embedding use case, so prevent clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Avoid leaking full local paths when users follow an external source.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
