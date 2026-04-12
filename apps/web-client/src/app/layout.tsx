import type { Metadata } from "next";
// Use the upstream Arrowtype Recursive variable font via fontsource.
// The `full` build preserves all five axes (wght, slnt, MONO, CASL, CRSV)
// and ships an unmodified woff2, avoiding Next.js's font subsetter which
// produced a malformed glyf table that Firefox's OTS rejected.
import "@fontsource-variable/recursive/full.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { AppInitializer } from "@/components/app-initializer";

export const metadata: Metadata = {
  title: "Crucible | Security Scenario Engine",
  description: "Advanced API security testing and simulation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen flex flex-col">
        <AppInitializer>
          <SiteHeader />
          <main className="flex-1 container mx-auto py-6 px-4">
            {children}
          </main>
        </AppInitializer>
      </body>
    </html>
  );
}
