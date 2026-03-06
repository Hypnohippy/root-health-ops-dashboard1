// app/signin/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

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

      // ✅ IMPORTANT:
      // Do NOT call /api/onboarding/bootstrap here.
      // The session cookie may not be visible to another server route immediately.
      window.location.href = nextUrl;
    } catch (e: any) {
      setStatus(e?.message || "Login failed.");
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Sign in</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Sign in to your dashboard.
      </p>

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            autoComplete="email"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </label>

        <button
          onClick={handleLogin}
          disabled={busy}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Link href="/pricing">See pricing</Link>
          <Link href="/">Back to home</Link>
        </div>

        {status ? (
          <div
            style={{
              marginTop: 6,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fafafa",
            }}
          >
            {status}
          </div>
        ) : null}
      </div>
    </main>
  );
}
