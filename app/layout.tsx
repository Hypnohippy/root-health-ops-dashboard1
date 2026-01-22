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
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {/* TikTok verifier sometimes wants the raw signature string visible in HTML */}
        <div style={{ position: "absolute", left: "-99999px", top: 0 }}>
          tiktok-developers-site-verification={TIKTOK_VERIFY}
        </div>

        {children}
      </body>
    </html>
  );
}
