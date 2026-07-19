import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MetaPixel } from "@/components/MetaPixel";
import { site } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: site.title,
    template: `%s — ${site.title}`,
  },
  description: site.description,
  metadataBase: new URL(site.url),
  openGraph: {
    siteName: site.siteName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    creator: site.author.twitter,
  },
  alternates: {
    types: {
      "application/rss+xml": `${site.url}/feed.xml`,
    },
  },
  verification: {
    google:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ??
      "Y6tFLq3gjrNjHNUS_Lpw-cpUs6m2enUpEgf-fd8bHjE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] font-sans text-zinc-900 dark:text-zinc-100">
        <MetaPixel />
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:px-6">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
