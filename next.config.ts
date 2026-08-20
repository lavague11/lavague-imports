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
    ],
  },
};

export default nextConfig;
