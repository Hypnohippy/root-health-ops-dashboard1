// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function getTypingElementFromTarget(target: EventTarget | null): HTMLElement | null {
  const el = target as HTMLElement | null;
  if (!el) return null;

  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return el;
  if ((el as any).isContentEditable) return el;

  const closest = el.closest?.("input, textarea, select, [contenteditable='true']");
  return (closest as HTMLElement | null) || null;
}

function placeCursorAtEnd(el: HTMLElement) {
  try {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const len = el.value?.length ?? 0;
      el.setSelectionRange(len, len);
    }
  } catch {
    // ignore
  }
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
   * ✅ FIX: "One letter then stops" = focus is being stolen after each keystroke.
   * This focus-lock returns focus back to the active input/textarea while typing.
   *
   * It’s global (covers every page under /dashboard).
   */
  const lastTypingElRef = useRef<HTMLElement | null>(null);
  const lastTypingTimeRef = useRef<number>(0);

  useEffect(() => {
    const markTyping = (target: EventTarget | null) => {
      const el = getTypingElementFromTarget(target);
      if (!el) return;
      lastTypingElRef.current = el;
      lastTypingTimeRef.current = Date.now();
    };

    const onFocusIn = (e: FocusEvent) => {
      markTyping(e.target);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Only track if typing in a field
      const el = getTypingElementFromTarget(e.target);
      if (!el) return;

      lastTypingElRef.current = el;
      lastTypingTimeRef.current = Date.now();
    };

    const onInput = (e: Event) => {
      // Fires when the input value changes
      markTyping(e.target);
    };

    const onFocusOut = (e: FocusEvent) => {
      const el = getTypingElementFromTarget(e.target);
      if (!el) return;

      // If focus is leaving a typing field right after a keystroke, pull it back.
      const recentlyTyping = Date.now() - lastTypingTimeRef.current < 1500;
      if (!recentlyTyping) return;

      // Re-focus on next tick after whatever stole it runs.
      setTimeout(() => {
        const last = lastTypingElRef.current;
        if (!last) return;

        const active = document.activeElement as HTMLElement | null;

        // If focus is already back in an input/textarea, do nothing
        const activeTyping = getTypingElementFromTarget(active);
        if (activeTyping) return;

        try {
          last.focus({ preventScroll: true } as any);
          placeCursorAtEnd(last);
        } catch {
          // ignore
        }
      }, 0);
    };

    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("input", onInput, true);

    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("input", onInput, true);
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
