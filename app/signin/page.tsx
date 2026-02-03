"use client";

import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleLogin() {
    setStatus("");

    if (!email || !password) {
      setStatus("Please enter email + password.");
      return;
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      setStatus(json?.error || "Login failed.");
      return;
    }

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
