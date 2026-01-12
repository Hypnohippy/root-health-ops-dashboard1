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
        {/* 
          ✅ Bulletproof Keyboard Guard
          Fixes: “only 1 letter then stops” in inputs/textareas.
          We use a raw <script> so it ALWAYS runs (more reliable than next/script here).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function typingEl(target) {
    if (!target) return null;
    var el = target;

    // If they click on a span inside a button, etc.
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

  // Track the last real typing element
  var last = null;
  var lastTime = 0;

  document.addEventListener("focusin", function (e) {
    var el = typingEl(e.target);
    if (el) { last = el; }
  }, true);

  // The key fix: stop ANY global key listeners while typing
  function guardKey(e) {
    var el = typingEl(e.target);
    if (!el) return;

    last = el;
    lastTime = Date.now();

    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    e.stopPropagation();
    // DO NOT preventDefault (we want typing to work normally)
  }

  // Also: if something steals focus right after a keypress, grab it back
  document.addEventListener("focusout", function () {
    if (!last) return;
    if (Date.now() - lastTime > 1500) return;

    setTimeout(function () {
      var active = document.activeElement;
      // If focus is already in an input/textarea, don't interfere
      if (active && typingEl(active)) return;

      try {
        last.focus({ preventScroll: true });

        // Put cursor at end for inputs/textareas
        if (last && (last.tagName || "").toLowerCase() === "input") {
          var len = last.value ? last.value.length : 0;
          last.setSelectionRange(len, len);
        }
        if (last && (last.tagName || "").toLowerCase() === "textarea") {
          var len2 = last.value ? last.value.length : 0;
          last.setSelectionRange(len2, len2);
        }
      } catch (_) {}
    }, 0);
  }, true);

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
