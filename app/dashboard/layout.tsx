// app/dashboard/layout.tsx
"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;

  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as any).isContentEditable) return true;

  const closest = el.closest?.("input, textarea, select, [contenteditable='true']");
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
   * ✅ HARD FIX: stop key hijacking globally while typing.
   * If any script/component attaches window/document key listeners (often for shortcuts),
   * they can break typing. This prevents that by stopping propagation in CAPTURE phase.
   */
  useEffect(() => {
    const stopHijack = (e: KeyboardEvent) => {
      if (!isTypingTarget(e.target)) return;

      // If user is typing in an input/textarea/select, do NOT let global shortcuts interfere.
      // stopImmediatePropagation beats other listeners on the same element too.
      (e as any).stopImmediatePropagation?.();
      e.stopPropagation();
      // Important: do NOT preventDefault, or typing/backspace may break.
    };

    // Capture phase = runs before most other handlers.
    window.addEventListener("keydown", stopHijack, true);
    window.addEventListener("keyup", stopHijack, true);
    window.addEventListener("keypress", stopHijack, true);

    return () => {
      window.removeEventListener("keydown", stopHijack, true);
      window.removeEventListener("keyup", stopHijack, true);
      window.removeEventListener("keypress", stopHijack, true);
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
              <span className="text-sm font-semibold text-slate-50">
                Root Health Ops
              </span>
              <span className="text-[11px] text-slate-300">
                Your cockpit for growth
              </span>
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
              <Link
                href="/dashboard/connect"
                className={linkClasses("/dashboard/connect")}
              >
                Connect
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/metrics"
                className={linkClasses("/dashboard/metrics")}
              >
                Metrics
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/campaigns"
                className={linkClasses("/dashboard/campaigns")}
              >
                Campaigns
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/sequences"
                className={linkClasses("/dashboard/sequences")}
              >
                Sequences
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/stories/new"
                className={linkClasses("/dashboard/stories/new")}
              >
                Stories
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/scheduled"
                className={linkClasses("/dashboard/scheduled")}
              >
                Scheduled
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/responses"
                className={linkClasses("/dashboard/responses")}
              >
                Responses
              </Link>
            </li>

            <li>
              <Link
                href="/dashboard/brainstorm"
                className={linkClasses("/dashboard/brainstorm")}
              >
                🧠 Brainstorm
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      {/* Page Content */}
      <main className="p-6">{children}</main>
    </div>
  );
}
