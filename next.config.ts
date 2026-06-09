import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Custom server handles WebSocket — can't use standalone
  // output: 'standalone',

  // Compress responses
  compress: true,

  // Power headers for Cloudflare SEO
  poweredByHeader: false,

  // Security & Cloudflare-compatible headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CF-compatible HSTS
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
        ],
      },
      // Admin routes — never cache
      {
        source: "/admin/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      // API routes — no cache, CORS
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      // Static assets — long cache (Cloudflare will respect this)
      {
        source: "/_next/static/(.*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  // Rewrites for WordPress paths (proxy to site repos if needed)
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
  },

  // Webpack config for better-sqlite3
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals || []), "better-sqlite3", "ws"];
    }
    return config;
  },

  // Images
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.blogspot.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },

  // Environment variables exposed to client
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "",
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "",
  },
};

export default nextConfig;
