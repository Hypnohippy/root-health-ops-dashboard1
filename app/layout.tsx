// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Root Health Ops",
  description: "Root Health Ops Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
        {/* Main content */}
        <main className="flex-1">
          {children}
        </main>

        {/* ✅ Required footer for platform compliance (TikTok, Meta, etc.) */}
        <footer className="border-t border-slate-800 bg-slate-950 px-4 py-4 text-center text-xs text-slate-400">
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-200 underline-offset-2 hover:underline"
          >
            Privacy Policy
          </a>
          <span className="mx-2">|</span>
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-200 underline-offset-2 hover:underline"
          >
            Terms of Service
          </a>
        </footer>
      </body>
    </html>
  );
}
