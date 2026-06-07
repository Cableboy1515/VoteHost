import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading a request header opts every route into dynamic rendering.
  // This is required for the nonce-based CSP in proxy.ts to work in production:
  // Next.js only stamps the per-request nonce onto its framework <script> tags
  // when the page is rendered dynamically. Without this, statically prerendered
  // pages (/login, /, /vote/recover, …) ship scripts with no nonce, and the
  // strict-dynamic CSP blocks them so the page never hydrates.
  // (Works in `next dev` because dev always renders dynamically.)
  await headers();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
