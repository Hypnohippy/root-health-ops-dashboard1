// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Root Health Ops",
  description: "Root Health Ops Dashboard",
};

const TIKTOK_VERIFY = "0B7fkj4hG1N8gVPjVcpfwYAqJJCJ9k5h";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Head method (some verifiers read this) */}
        <meta name="tiktok-developers-site-verification" content={TIKTOK_VERIFY} />
      </head>

      <body className="min-h-screen bg-slate-950 text-slate-50">
        {/* Body method (some verifiers ONLY scrape body text) */}
        <div style={{ display: "none" }}>
          {`tiktok-developers-site-verification=${TIKTOK_VERIFY}`}
        </div>

        {children}
      </body>
    </html>
  );
}
