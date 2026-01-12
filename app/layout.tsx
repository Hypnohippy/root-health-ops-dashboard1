// app/layout.tsx
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
          ✅ Keyboard Hijack Guard (BEFORE everything)
          If anything in the app registers global shortcut listeners that break typing,
          this runs first and prevents those listeners from interfering *only* while typing.
        */}
        <Script id="rh-ops-keyboard-guard" strategy="beforeInteractive">
          {`
            (function () {
              function isTypingTarget(t) {
                if (!t) return false;
                var el = t;
                // If it's a child of an input, closest() will find the real field
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
                // Only protect real typing fields
                if (!isTypingTarget(e.target)) return;

                // Allow the browser to handle typing normally,
                // but block any global shortcut handlers from hijacking the event.
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                e.stopPropagation();
                // IMPORTANT: do NOT preventDefault, or typing/backspace can break.
              }

              // Capture phase so we run before most app code
              document.addEventListener("keydown", guard, true);
              document.addEventListener("keypress", guard, true);
              document.addEventListener("keyup", guard, true);
            })();
          `}
        </Script>
      </head>

      <body className="min-h-screen bg-slate-950 text-slate-50">{children}</body>
    </html>
  );
}
