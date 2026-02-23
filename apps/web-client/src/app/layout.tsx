import type { Metadata } from "next";
import { Recursive } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

const recursive = Recursive({
  variable: "--font-recursive",
  subsets: ["latin"],
  axes: ["MONO", "CASL", "CRSV"],
});

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
      <body
        className={`${recursive.variable} antialiased min-h-screen flex flex-col`}
      >
        <SiteHeader />
        <main className="flex-1 container mx-auto py-6 px-4">
          {children}
        </main>
      </body>
    </html>
  );
}
