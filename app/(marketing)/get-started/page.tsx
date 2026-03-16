// app/get-started/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabaseBrowser";

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200">
      {children}
    </span>
  );
}

export default function GetStartedPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");

    const userEmail = email.trim();
    const userPassword = password;

    if (!userEmail || !userPassword) {
      setStatus("Please enter your email and password.");
      return;
    }

    if (userPassword.length < 8) {
      setStatus("Use at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabaseBrowser.auth.signUp({
        email: userEmail,
        password: userPassword,
        options: {
          emailRedirectTo: "https://roothealthops.com/signin",
        },
      });

      if (error) {
        setStatus(error.message || "Sign up failed.");
        setBusy(false);
        return;
      }

      if (data.session) {
        setStatus("Account created. Redirecting…");
        window.location.href = "/pricing";
        return;
      }

      setStatus("Account created. Check your email to confirm your account.");
      setBusy(false);
    } catch (err: any) {
      setStatus(err?.message || "Sign up failed.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 shadow-xl">
        <div className="flex flex-wrap gap-2">
          <Pill>Root Health Ops</Pill>
          <Pill>Calm professional visibility</Pill>
        </div>

        <h1 className="mt-4 text-2xl font-semibold">Create account</h1>

        <p className="mt-2 text-sm text-slate-300 leading-relaxed">
          Start your account and choose the route that fits you best.
        </p>

        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Root Health Ops supports practitioners, students, alumni, and wider
          professional communities who want a calmer, more ethical way to build
          professional visibility.
        </p>

        <form onSubmit={handleSignUp} className="mt-6 grid gap-4">
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
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>

          {status ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              {status}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-sm pt-1">
            <Link
              href="/signin"
              className="text-slate-300 hover:text-slate-100"
            >
              Already have an account? Sign in
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
