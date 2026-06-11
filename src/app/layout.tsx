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
    default: "GigTrotter — where your journey lives",
    template: "%s · GigTrotter",
  },
  description:
    "Where your journey lives. The wallet that remembers — your tickets, flights and bookings quietly become a private map of your life.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  applicationName: "GigTrotter",
  appleWebApp: {
    capable: true,
    title: "GigTrotter",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "GigTrotter — where your journey lives",
    description: "The wallet that remembers. Your life, your map, your terms.",
    type: "website",
    siteName: "GigTrotter",
  },
  twitter: {
    card: "summary_large_image",
    title: "GigTrotter — where your journey lives",
    description: "The wallet that remembers.",
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
