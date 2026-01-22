// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Root Health Ops",
  description: "Root Health Ops Dashboard",
};

const TIKTOK_VERIFICATION =
  "tiktok-developers-site-verification=P6W3E8CfxKyF1EmqoWpO9y6wx8raoZzI";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50">
        {/* 
          IMPORTANT:
          TikTok verification crawlers do NOT run JS.
          This must be present in the initial HTML response.
        */}
        <div
          style={{
            position: "absolute",
            left: "-99999px",
            top: "-99999px",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
          aria-hidden="true"
        >
          {TIKTOK_VERIFICATION}
        </div>

        {children}
      </body>
    </html>
  );
}
