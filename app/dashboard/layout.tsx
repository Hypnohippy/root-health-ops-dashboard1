// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function isTypingElement(el: Element | null) {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName?.toLowerCase?.() || "";
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as any).isContentEditable) return true;
  return false;
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as Element | null;
  if (!el) return false;
  if (isTypingElement(el)) return true;
  const closest = (el as any).closest?.("input, textarea, select, [contenteditable='true']");
  return Boolean(closest);
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  const linkClasses = (href: string) => {
    const isActive =
      pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

    return [
      "block rounded-md px-3 py-1.5 text-sm transition-colors",
      isActive ? "bg-emerald-400 text-slate-950" : "text-slate-100 hover:bg-white/10",
    ].join(" ");
  };

  /**
   * ✅ Bulletproof “focus guard” for dashboard inputs
   * Symptom: you can type 1 character then typing stops (focus gets stolen).
   * Fix: remember the last focused input/textarea, and re-focus it if something steals focus.
   */
  const lastTypingElRef = useRef<HTMLElement | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      const el =
        (isTypingElement(target) ? (target as HTMLElement) : null) ||
        ((target as any).closest?.("input, textarea, select, [contenteditable='true']") as
          | HTMLElement
          | null);

      if (el) {
        lastTypingElRef.current = el;
      }
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      // Only care when the user is typing in a field
      if (!isTypingTarget(e.target)) return;

      lastKeyTimeRef.current = Date.now();

      // Stop other shortcut handlers from interfering (but do NOT preventDefault)
      (e as any).stopImmediatePropagation?.();
      e.stopPropagation();

      // If something steals focus right after this keypress, force focus back
      const el = lastTypingElRef.current;
      if (!el) return;

      // Re-focus on next tick (after any rogue handler runs)
      setTimeout(() => {
        // Only do this if focus moved away during typing
        const active = document.activeElement as HTMLElement | null;
        if (active && (active === el || el.contains(active))) return;

        // If user is still actively typing (recent keystroke), reclaim focus
        if (Date.now() - lastKeyTimeRef.current > 1200) return;

        try {
          el.focus({ preventScroll: true } as any);

          // Place cursor at end for inputs/textareas (safe default)
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const len = el.value?.length ?? 0;
            el.setSelectionRange(len, len);
          }
        } catch {
          // ignore
        }
      }, 0);
    };

    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("keydown", onKeyDownCapture, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="border-b border-white/10 bg-black/30 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-400/80 shadow-lg shadow-emerald-500/40" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-slate-50">Root Health Ops</span>
              <span className="text-[11px] text-slate-300">Your cockpit for growth</span>
            </div>
          </div>

          {/* Nav links */}
          <ul className="flex items-center gap-2">
            <li>
              <Link href="/dashboard" className={linkClasses("/dashboard")}>
                Home
              </Link>
            </li>

            <li>
              <Link href="/dashboard/connect" className={linkClasses("/dashboard/connect")}>
                Connect
              </Link>
            </li>

            <li>
              <Link href="/dashboard/metrics" className={linkClasses("/dashboard/metrics")}>
                Metrics
              </Link>
            </li>

            <li>
              <Link href="/dashboard/campaigns" className={linkClasses("/dashboard/campaigns")}>
                Campaigns
              </Link>
            </li>

            <li>
              <Link href="/dashboard/sequences" className={linkClasses("/dashboard/sequences")}>
                Sequences
              </Link>
            </li>

            <li>
              <Link href="/dashboard/stories/new" className={linkClasses("/dashboard/stories/new")}>
                Stories
              </Link>
            </li>

            <li>
              <Link href="/dashboard/scheduled" className={linkClasses("/dashboard/scheduled")}>
                Scheduled
              </Link>
            </li>

            <li>
              <Link href="/dashboard/responses" className={linkClasses("/dashboard/responses")}>
                Responses
              </Link>
            </li>

            <li>
              <Link href="/dashboard/brainstorm" className={linkClasses("/dashboard/brainstorm")}>
                🧠 Brainstorm
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main className="p-6">{children}</main>
    </div>
  );
}
