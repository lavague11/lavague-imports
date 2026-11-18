import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { CartProvider } from "@/components/cart/cart-provider";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { StorefrontChrome } from "@/components/layout/storefront-chrome";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: [
      {
        url: "/social-share.webp",
        width: 1200,
        height: 514,
        alt: `${site.name} — a spread of Moroccan olive oil, olives, pasta, tea and North African sodas`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    images: ["/social-share.webp"],
  },
  // Run as a standalone app from the iPhone/Android home screen (no browser
  // chrome). This is also what enables the in-app pull-to-refresh gesture.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: site.name,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#333d22",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} h-full scroll-smooth antialiased`}
    >
      <body className="flex min-h-full flex-col bg-white">
        <PullToRefresh />
        <CartProvider>
          <StorefrontChrome header={<Header />} footer={<Footer />}>
            {children}
          </StorefrontChrome>
        </CartProvider>
      </body>
    </html>
  );
}
