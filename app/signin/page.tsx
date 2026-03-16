// app/signin/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

const RESET_REDIRECT_URL = "https://roothealthops.com/reset-password";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");

    const userEmail = email.trim();
    const userPassword = password;

    if (!userEmail || !userPassword) {
      setStatus("Please enter your email and password.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email: userEmail,
        password: userPassword,
      });

      if (error) {
        setStatus(error.message || "Sign-in failed.");
        setBusy(false);
        return;
      }

      setStatus("Signed in. Redirecting…");
      window.location.href = nextUrl;
    } catch (err: any) {
      setStatus(err?.message || "Sign-in failed.");
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setStatus("");

    const userEmail = email.trim();
    if (!userEmail) {
      setStatus("Enter your email first, then click Forgot password.");
      return;
    }

    setResetBusy(true);

    try {
      const { error } = await supabaseBrowser.auth.resetPasswordForEmail(
        userEmail,
        {
          redirectTo: RESET_REDIRECT_URL,
        }
      );

      if (error) {
        setStatus(error.message || "Could not send password reset email.");
        setResetBusy(false);
        return;
      }

      setStatus("Password reset email sent.");
      setResetBusy(false);
    } catch (err: any) {
      setStatus(err?.message || "Could not send password reset email.");
      setResetBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 shadow-xl">
        <div className="flex flex-wrap gap-2">
          <Pill>Root Health Ops</Pill>
          <Pill>Calm professional visibility</Pill>
        </div>

        <h1 className="mt-4 text-2xl font-semibold">Sign in</h1>

        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
          Sign in to continue to your dashboard, your professional visibility
          workflow, and your connected tools.
        </p>

        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Whether you are a practitioner, student, alumnus, or part of a wider
          training-provider community, this is where your Root Health Ops
          workspace begins.
        </p>

        <form onSubmit={handleLogin} className="mt-6 grid gap-4">
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
            type="submit"
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
            <Link
              href="/get-started"
              className="text-slate-300 hover:text-slate-100"
            >
              Create account
            </Link>
            <Link href="/" className="text-slate-300 hover:text-slate-100">
              Back to home
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
