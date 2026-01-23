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
  const verifyLine = `tiktok-developers-site-verification=${TIKTOK_VERIFY}`;

  return (
    <html lang="en">
      <head>
        {/* Keep meta too (doesn’t hurt) */}
        <meta name="tiktok-developers-site-verification" content={TIKTOK_VERIFY} />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {/* CRITICAL: inject as raw HTML so it’s not split by React into <!-- --> */}
        <div
          style={{ position: "absolute", left: "-99999px", top: 0 }}
          dangerouslySetInnerHTML={{ __html: verifyLine }}
        />
        {children}
      </body>
    </html>
  );
}
