// app/signin/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const nextUrl = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const next = String(sp.get("next") || "").trim();
      return next || "/dashboard";
    } catch {
      return "/dashboard";
    }
  }, []);

  async function handleLogin() {
    setStatus("");

    const e = email.trim();
    const p = password;

    if (!e || !p) {
      setStatus("Please enter email + password.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: e, password: p }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setStatus(json?.error || "Login failed.");
        setBusy(false);
        return;
      }

      setStatus("Signed in. Redirecting…");
      window.location.href = nextUrl;
    } catch (e: any) {
      setStatus(e?.message || "Login failed.");
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setStatus("");

    const e = email.trim();
    if (!e) {
      setStatus("Enter your email first, then click Forgot password.");
      return;
    }

    setResetBusy(true);

    try {
      const redirectTo = `${window.location.origin}/reset-password`;

      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(e, {
        redirectTo,
      });

      if (error) {
        setStatus(error.message || "Could not send password reset email.");
        setResetBusy(false);
        return;
      }

      setStatus("Password reset email sent. Check your inbox.");
      setResetBusy(false);
    } catch (e: any) {
      setStatus(e?.message || "Could not send password reset email.");
      setResetBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 shadow-xl">
        <div className="text-xs text-slate-400">Root Health Ops</div>
        <h1 className="mt-1 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-slate-300">
          Sign in to your dashboard.
        </p>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@domain.com"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={busy}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetBusy}
            className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-3 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
          >
            {resetBusy ? "Sending reset email…" : "Forgot password"}
          </button>

          {status ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              {status}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-sm pt-1">
            <Link href="/pricing" className="text-slate-300 hover:text-slate-100">
              See pricing
            </Link>
            <Link href="/" className="text-slate-300 hover:text-slate-100">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
