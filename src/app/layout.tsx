import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Providers } from "@/components/providers";
import { FeedbackButton } from "@/features/feedback/feedback-button";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GigTrotter — the gig never ends",
    template: "%s · GigTrotter",
  },
  description:
    "Discover gigs, grab tickets, join the discussion, and build a map of every live experience you've ever had. Your music life, all in one place.",
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3002",
  ),
  applicationName: "GigTrotter",
  appleWebApp: {
    capable: true,
    title: "GigTrotter",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "GigTrotter — the gig never ends",
    description: "Discover, attend, share, remember. Your music life, all in one place.",
    type: "website",
    siteName: "GigTrotter",
  },
  twitter: {
    card: "summary_large_image",
    title: "GigTrotter — the gig never ends",
    description: "Discover, attend, share, remember. Your music life, all in one place.",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${GeistMono.variable} font-sans`}>
        <Providers>
          {children}
          <FeedbackButton />
        </Providers>
      </body>
    </html>
  );
}
