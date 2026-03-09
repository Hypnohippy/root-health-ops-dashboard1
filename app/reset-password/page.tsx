// app/reset-password/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

function parseHashParams() {
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;

    const sp = new URLSearchParams(hash);

    return {
      access_token: String(sp.get("access_token") || "").trim(),
      refresh_token: String(sp.get("refresh_token") || "").trim(),
      type: String(sp.get("type") || "").trim(),
    };
  } catch {
    return {
      access_token: "",
      refresh_token: "",
      type: "",
    };
  }
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking your reset link…");
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return (
      !busy &&
      ready &&
      password.trim().length >= 8 &&
      confirmPassword.trim().length >= 8
    );
  }, [busy, ready, password, confirmPassword]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        setError("");
        setStatus("Checking your reset link…");

        const url = new URL(window.location.href);
        const code = String(url.searchParams.get("code") || "").trim();
        const hashParams = parseHashParams();
        const hasHashTokens =
          !!hashParams.access_token && !!hashParams.refresh_token;

        if (code) {
          const { error } =
            await supabaseBrowser.auth.exchangeCodeForSession(code);

          if (error) {
            if (!mounted) return;
            setReady(false);
            setError(error.message || "This reset link is invalid or expired.");
            setStatus("");
            return;
          }

          if (!mounted) return;
          setReady(true);
          setStatus("Reset link accepted. Enter your new password.");
          return;
        }

        if (hasHashTokens) {
          const { error } = await supabaseBrowser.auth.setSession({
            access_token: hashParams.access_token,
            refresh_token: hashParams.refresh_token,
          });

          if (error) {
            if (!mounted) return;
            setReady(false);
            setError(error.message || "Could not restore your recovery session.");
            setStatus("");
            return;
          }

          if (!mounted) return;
          setReady(true);
          setStatus("Recovery confirmed. Enter your new password.");
          return;
        }

        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();

        if (!mounted) return;

        if (session) {
          setReady(true);
          setStatus("Recovery confirmed. Enter your new password.");
          return;
        }

        setReady(false);
        setStatus("");
        setError(
          "This reset link is invalid, expired, or missing recovery data. Please request a new password reset email."
        );
      } catch (e: any) {
        if (!mounted) return;
        setReady(false);
        setStatus("");
        setError(e?.message || "Could not verify the reset link.");
      }
    }

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setError("");
        setStatus("Recovery confirmed. Enter your new password.");
      }
    });

    void boot();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");

    const p1 = password.trim();
    const p2 = confirmPassword.trim();

    if (!p1 || !p2) {
      setError("Please enter your new password twice.");
      return;
    }

    if (p1.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    if (p1 !== p2) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const { error } = await supabaseBrowser.auth.updateUser({
        password: p1,
      });

      if (error) {
        setError(error.message || "Could not update password.");
        setBusy(false);
        return;
      }

      setStatus("Password updated successfully. Redirecting to sign in…");
      setError("");
      setBusy(false);

      setTimeout(() => {
        window.location.href = "/signin";
      }, 1200);
    } catch (e: any) {
      setError(e?.message || "Could not update password.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-12">
      <div className="mx-auto w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 shadow-xl">
        <div className="text-xs text-slate-400">Root Health Ops</div>
        <h1 className="mt-1 text-2xl font-semibold">Reset password</h1>
        <p className="mt-2 text-sm text-slate-300">
          Set a new password for your account.
        </p>

        <form onSubmit={handleReset} className="mt-6 grid gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Type it again"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {busy ? "Updating…" : "Save new password"}
          </button>

          {status ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-100">
              {status}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="pt-1 text-sm">
            <Link href="/signin" className="text-slate-300 hover:text-slate-100">
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
