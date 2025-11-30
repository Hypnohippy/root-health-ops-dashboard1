import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Root Health Ops Dashboard",
  description: "Root Health automation and campaign management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* --- GLOBAL NAVIGATION BAR --- */}
        <nav className="w-full border-b bg-white/80 backdrop-blur-md p-4 flex items-center gap-6">
          <Link href="/dashboard" className="text-sm font-medium hover:underline">
            Dashboard
          </Link>

          <Link
            href="/dashboard/campaigns"
            className="text-sm font-medium hover:underline"
          >
            Campaigns
          </Link>

          <Link
            href="/dashboard/content"
            className="text-sm font-medium hover:underline"
          >
            Content
          </Link>

          <Link
            href="/dashboard/stories/new"
            className="text-sm font-medium hover:underline"
          >
            Stories
          </Link>

          <Link
            href="/dashboard/brainstorm"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            🧠 Brainstorm Studio
          </Link>
        </nav>

        {/* --- PAGE CONTENT --- */}
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
