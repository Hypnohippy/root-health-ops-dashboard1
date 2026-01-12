// app/dashboard/layout.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;

  // If click/keydown originates inside an input wrapper etc.
  const closest = (el as any).closest?.(
    "input, textarea, select, [contenteditable='true']"
  ) as HTMLElement | null;

  const node = closest || el;
  const tag = (node.tagName || "").toLowerCase();

  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((node as any).isContentEditable) return true;

  return false;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  const linkClasses = (href: string) => {
    const isActive =
      pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

    return [
      "block rounded-md px-3 py-1.5 text-sm transition-colors",
      isActive
        ? "bg-emerald-400 text-slate-950"
        : "text-slate-100 hover:bg-white/10",
    ].join(" ");
  };

  // ✅ KEY FIX:
  // Stop key events bubbling to any global “shortcut” handlers while typing.
  const stopWhenTyping = (e: React.SyntheticEvent) => {
    const native = e.nativeEvent as any;
    const target = native?.target ?? null;

    if (!isTypingTarget(target)) return;

    // Don't break typing; just stop the event reaching higher-level handlers.
    e.stopPropagation();

    // Also stop native propagation for any non-React listeners higher up.
    if (native?.stopImmediatePropagation) native.stopImmediatePropagation();
    if (native?.stopPropagation) native.stopPropagation();
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50"
      // Capture phase = we intercept before other handlers above children.
      onKeyDownCapture={stopWhenTyping}
      onKeyUpCapture={stopWhenTyping}
      onKeyPressCapture={stopWhenTyping}
      // Some browsers/extensions use beforeinput/input paths; cover those too:
      onBeforeInputCapture={stopWhenTyping}
      onInputCapture={stopWhenTyping}
    >
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
