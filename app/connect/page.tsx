"use client";

import React from "react";

export default function ConnectPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-3xl bg-slate-900/80 border border-slate-700 rounded-3xl shadow-xl p-6 md:p-10 backdrop-blur">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">
            Connect your channels
          </h1>
          <p className="mt-2 text-sm text-slate-300 max-w-xl">
            This is where Root Health Ops will plug into Facebook, Instagram,
            LinkedIn, TikTok and more. For now, this page is a safe placeholder
            so you can move around the app without errors while we wire the real
            connections.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 text-xs mb-6">
          {[
            "Facebook Page",
            "Instagram Business",
            "LinkedIn Page",
            "TikTok",
            "Google Business Profile",
            "Email newsletter",
          ].map((label) => (
            <div
              key={label}
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 flex items-center justify-between"
            >
              <div>
                <div className="text-slate-100 font-medium">{label}</div>
                <div className="text-[11px] text-slate-400">
                  Connection coming soon.
                </div>
              </div>
              <button
                type="button"
                disabled
                className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 cursor-not-allowed"
              >
                Not yet available
              </button>
            </div>
          ))}
        </section>

        <footer className="text-[11px] text-slate-500">
          As we wire in each platform, this page will light up with real
          “Connect” buttons and status tags so you can see everything at a
          glance.
        </footer>
      </div>
    </div>
  );
}
