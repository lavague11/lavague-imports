import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nodemailer is a server-only dependency; keep it out of the bundle.
  serverExternalPackages: ["nodemailer"],
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
