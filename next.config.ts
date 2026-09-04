import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only dependencies; keep them out of the bundle.
  serverExternalPackages: ["nodemailer", "pdf-lib", "qrcode", "jimp"],
  // Present so dev (Turbopack) doesn't error on the webpack config below.
  turbopack: {},
  // Avoid webpack's wasm xxhash path, which crashes on large modules under this
  // Node version ("WasmHash._updateWithBuffer … reading 'length'"). Applies to
  // the production `next build --webpack` only.
  webpack: (config: { output?: { hashFunction?: string } }) => {
    config.output = config.output ?? {};
    config.output.hashFunction = "sha256";
    return config;
  },
  images: {
    remotePatterns: [
      // Product photography imported from the source catalogs. Replace with your
      // own hosting when photos are consolidated.
      { protocol: "https", hostname: "static.wixstatic.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "www.ziyad.com" },
      { protocol: "https", hostname: "cdn11.bigcommerce.com" },
      { protocol: "https", hostname: "moroccanpantryshop.com" },
    ],
  },
  // Stop a shared CDN (Hostinger's `hcdn`) from caching HTML documents long-term.
  // Next serves static pages with `s-maxage=31536000`, so the CDN was pinning a
  // stale HTML page for days; after a redeploy rotated the hashed asset names,
  // that old HTML pointed at `/_next/static` files that no longer existed → 404
  // CSS/JS → unstyled site. Forcing revalidation on documents means the CDN
  // always re-checks the origin, so a deploy's HTML and its assets stay in sync.
  //
  // Scope: exclude `/_next/*` (framework assets are content-hashed and immutable —
  // Next won't let this override them anyway — and the image optimizer manages its
  // own caching) and `/api/*` (route handlers set their own Cache-Control).
  async headers() {
    return [
      {
        source: "/((?!api/|_next/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
