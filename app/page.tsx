// app/page.tsx
"use client";

import React from "react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="mx-auto max-w-6xl px-4 py-6 flex items-center justify-between">
        <div className="text-sm font-semibold">Root Health Ops</div>

        <nav className="flex items-center gap-4 text-sm">
          <a className="text-slate-300 hover:text-white" href="#how">
            How it works
          </a>
          <a className="text-slate-300 hover:text-white" href="#pricing">
            Pricing
          </a>
          <a className="text-slate-300 hover:text-white" href="/signin">
            Sign in
          </a>
          <a
            className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400"
            href="/signin"
          >
            Get started
          </a>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="mt-10 rounded-3xl border border-slate-800 bg-slate-900/40 p-8">
          <h1 className="text-3xl md:text-4xl font-semibold">
            Run your practice. Stay human.
          </h1>

          <p className="mt-4 text-slate-300 max-w-2xl">
            A calmer way to stay visible — without becoming a marketing machine.
            Root Health Ops helps you show up consistently, protect your energy,
            and grow your practice in a way that still feels like you.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/signin"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Sign in
            </a>
            <a
              href="/dashboard"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 text-sm text-slate-100 hover:border-slate-500"
            >
              Go to dashboard →
            </a>
          </div>

          <div className="mt-6 text-xs text-slate-500">
            Note: Dashboard requires sign-in once we finish Step 2.
          </div>
        </section>

        <section id="how" className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="text-sm font-semibold">For therapists & coaches</div>
            <div className="mt-2 text-slate-300">
              Calm, ethical growth. Built to reduce overwhelm.
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="text-sm font-semibold">What you can do today</div>
            <ul className="mt-3 space-y-2 text-slate-300 text-sm">
              <li>• Post across platforms</li>
              <li>• Schedule content while you sleep</li>
              <li>• Stories generator</li>
              <li>• Brainstorm space</li>
            </ul>
          </div>
        </section>

        <section id="pricing" className="mt-10 rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="text-sm font-semibold">Pricing</div>
          <div className="mt-2 text-slate-300 text-sm">
            (We’ll wire this properly next — for now it’s a placeholder section.)
          </div>
        </section>
      </main>
    </div>
  );
}
