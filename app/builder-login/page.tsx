"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "../../lib/supabaseBrowser";

export default function BuilderLoginPage() {
  const enabled =
    (process.env.NEXT_PUBLIC_BUILDER_LOGIN_ENABLED ?? "").toLowerCase() === "true";

  const allowedEmail = process.env.NEXT_PUBLIC_BUILDER_LOGIN_EMAIL ?? "";

  // Keep a stable reference (no functional change, just clarity)
  const supabase = useMemo(() => supabaseBrowser, []);

  const [email, setEmail] = useState(allowedEmail);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  async function handleLogin() {
    setStatus("");

    if (!enabled) {
      setStatus("Builder login is disabled.");
      return;
    }
    if (!email || !password) {
      setStatus("Please enter email + password.");
      return;
    }
    if (
      allowedEmail &&
      email.trim().toLowerCase() !== allowedEmail.trim().toLowerCase()
    ) {
      setStatus("This email is not allowed for builder login.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    if (data?.session) {
      setStatus("Logged in. Redirecting to /dashboard…");
      window.location.href = "/dashboard";
      return;
    }

    // Rare, but handle it
    setStatus("Login complete, but no session returned. Try refreshing.");
  }

  async function handleLogout() {
    setStatus("");
    await supabase.auth.signOut();
    setStatus("Signed out.");
  }

  if (!enabled) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Builder Login</h1>
        <p style={{ marginTop: 10 }}>
          Builder login is disabled. Set{" "}
          <code>NEXT_PUBLIC_BUILDER_LOGIN_ENABLED=true</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Builder Login</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Internal access only (does not change customer subscribe flow).
      </p>

      <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
            style={{
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
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

        <button
          onClick={handleLogout}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #ccc",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign out
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
