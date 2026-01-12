// app/layout.tsx
import "./globals.css";
import React from "react";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Root Health Ops",
  description: "Root Health Ops Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* 
          ✅ Keyboard Hijack Guard (runs before everything)
          Fixes: “can only type 1 character” in inputs/search/reply boxes.
        */}
        <Script id="rh-ops-keyboard-guard" strategy="beforeInteractive">
          {`
            (function () {
              function isTypingTarget(t) {
                if (!t) return false;
                var el = t;

                if (el && el.closest) {
                  var c = el.closest("input, textarea, select, [contenteditable='true']");
                  if (c) el = c;
                }

                if (!el || !el.tagName) return false;
                var tag = (el.tagName || "").toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select") return true;
                if (el.isContentEditable) return true;
                return false;
              }

              function guard(e) {
                if (!isTypingTarget(e.target)) return;

                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.stopPropagation();
                // Do NOT preventDefault – we want typing to still work.
              }

              document.addEventListener("keydown", guard, true);
              document.addEventListener("keypress", guard, true);
              document.addEventListener("keyup", guard, true);
            })();
          `}
        </Script>
      </head>

      <body className="min-h-screen bg-slate-950 text-slate-50">
        {children}
      </body>
    </html>
  );
}
