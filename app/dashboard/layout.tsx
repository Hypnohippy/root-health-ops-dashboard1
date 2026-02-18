// app/dashboard/layout.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

type SocialAccountsResponse = {
  success?: boolean;
  organisationId?: string;
  socialAccounts?: any[];
  error?: string;
};

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

  // ---------------- Support modal state ----------------
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportEmail, setSupportEmail] = useState("");
  const [supportMsg, setSupportMsg] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportDone, setSupportDone] = useState<null | "ok" | "fail">(null);
  const [supportError, setSupportError] = useState<string | null>(null);

  const [orgId, setOrgId] = useState<string>("");

  const canSend = useMemo(() => {
    return !supportSending && supportMsg.trim().length >= 5;
  }, [supportSending, supportMsg]);

  async function tryLoadOrgId() {
    try {
      // This endpoint already exists in your stack (you pasted its JSON output earlier).
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const json: SocialAccountsResponse = await res.json().catch(() => ({} as any));
      if (res.ok && json?.organisationId) {
        setOrgId(String(json.organisationId));
      }
    } catch {
      // silent - we can still report without org id (backend falls back)
    }
  }

  function openSupport() {
    setSupportOpen(true);
    setSupportDone(null);
    setSupportError(null);

    // Pre-fill message with the page they were on (nice UX)
    setSupportMsg((prev) => {
      const base = prev.trim();
      if (base) return prev;
      return `Hi Support — I’m having an issue on:\n${window.location.href}\n\nWhat happened:\n`;
    });

    // Load org id in background
    if (!orgId) {
      void tryLoadOrgId();
    }
  }

  function closeSupport() {
    setSupportOpen(false);
    setSupportSending(false);
    setSupportDone(null);
    setSupportError(null);
    // keep message/email so user doesn’t lose it if they reopen
  }

  // ESC closes modal
  useEffect(() => {
    if (!supportOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSupport();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportOpen]);

  async function sendSupport() {
    if (!canSend) return;

    setSupportSending(true);
    setSupportError(null);
    setSupportDone(null);

    try {
      const res = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          organisationId: orgId || null,
          email: supportEmail.trim() || null,
          message: supportMsg.trim(),
          pathname: pathname || null,
          href: typeof window !== "undefined" ? window.location.href : null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        }),
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setSupportDone("fail");
        setSupportError(json?.error || `Support message failed (${res.status}).`);
        setSupportSending(false);
        return;
      }

      setSupportDone("ok");
      setSupportSending(false);
    } catch (e: any) {
      setSupportDone("fail");
      setSupportError(e?.message || "Support message failed.");
      setSupportSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex flex-col">
      {/* Top Nav */}
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
          <ul className="flex items-center gap-2 flex-wrap justify-end">
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
                href="/dashboard/growth lab"
                className={linkClasses("/dashboard/growth lab")}
              >
                Growth Lab
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
                href="/dashboard/approvals"
                className={linkClasses("/dashboard/approvals")}
              >
                Approvals
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

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>

      {/* App Footer (legal + contact) */}
      <footer className="border-t border-white/10 py-4 text-[12px] text-slate-400">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Root Health Ops</div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={openSupport}
              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-500/15 hover:text-emerald-100"
            >
              Contact Support
            </button>

            <Link href="/terms" className="hover:text-slate-200">
              Terms of Service
            </Link>

            <Link href="/privacy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {/* Support Modal */}
      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeSupport} />

          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Support</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Contact Root Health Ops
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  We’ll automatically attach the latest error details (JSON) so you don’t have to.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeSupport}
              >
                Close
              </button>
            </div>

            {supportDone === "ok" ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-emerald-100">
                Sent ✅ We’ve received your message (with diagnostic details attached).
              </div>
            ) : null}

            {supportDone === "fail" ? (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
                Failed to send. {supportError || "Please try again."}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Your email (optional)
                </label>
                <input
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@domain.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  What happened?
                </label>
                <textarea
                  value={supportMsg}
                  onChange={(e) => setSupportMsg(e.target.value)}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Tell us what you tried and what you expected…"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Tip: mention the platform (e.g., LinkedIn/Threads) and whether it was Quick Blast or Scheduled.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={sendSupport}
                  disabled={!canSend}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {supportSending ? "Sending…" : "Send to Support"}
                </button>

                <button
                  type="button"
                  onClick={closeSupport}
                  disabled={supportSending}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Press <b>Esc</b> to close.
              </div>

              {orgId ? (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will be attached for org <span className="break-all">{orgId}</span>)
                </div>
              ) : (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will still send — org auto-detect will be attempted server-side.)
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
