// app/signin/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleLogin() {
    setStatus("");

    const e = email.trim();
    if (!e || !password) {
      setStatus("Please enter email + password.");
      return;
    }

    const { error } = await supabaseBrowser.auth.signInWithPassword({
      email: e,
      password,
    });

    if (error) {
      setStatus(error.message || "Login failed.");
      return;
    }

    // (Optional but recommended) bootstrap org/membership if you have that endpoint
    // If you haven't created it yet, this will just silently fail and not block login.
    await fetch("/api/onboarding/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    }).catch(() => null);

    setStatus("Signed in. Redirecting…");
    window.location.href = "/dashboard";
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
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign in
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
