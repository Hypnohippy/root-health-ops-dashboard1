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
      <head>
        {/* ✅ Keyboard Guard v2 (NO focus stealing)
            Fixes: “only 1 letter then stops” by blocking global hotkeys while typing.
            IMPORTANT: We do NOT refocus inputs on focusout (that caused the “skippy jump”).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function typingEl(target) {
    if (!target) return null;
    var el = target;

    if (el && el.closest) {
      var c = el.closest("input, textarea, select, [contenteditable='true']");
      if (c) el = c;
    }

    if (!el || !el.tagName) return null;
    var tag = (el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return el;
    if (el.isContentEditable) return el;
    return null;
  }

  function guardKey(e) {
    var el = typingEl(e.target);
    if (!el) return;

    // Stop any global key listeners (hotkeys) from intercepting typing
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    e.stopPropagation();
    // DO NOT preventDefault (we want typing to work normally)
  }

  document.addEventListener("keydown", guardKey, true);
  document.addEventListener("keypress", guardKey, true);
  document.addEventListener("keyup", guardKey, true);
})();`,
          }}
        />
      </head>

      <body className="min-h-screen bg-slate-950 text-slate-50">{children}</body>
    </html>
  );
}
