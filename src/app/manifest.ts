import type { MetadataRoute } from "next";

import { site } from "@/lib/site";

// Web app manifest — lets the site install to the home screen as a standalone
// app (Android/Chrome). iOS uses the apple-mobile-web-app meta tags in layout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: "La Vague",
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#333d22",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
