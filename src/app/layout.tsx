import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GigTrotter — the wallet that remembers",
    template: "%s · GigTrotter",
  },
  description:
    "A capture-first ticket & travel wallet that builds a private life map automatically. Your tickets, flights and bookings live here — and quietly become a beautiful, private map of your life.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "GigTrotter — the wallet that remembers",
    description: "Your life, your map, your terms.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${GeistMono.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
