// app/dashboard/sequences/page.tsx
"use client";

import React, { useEffect, useState } from "react";

type Sequence = {
  id: string;
  organisation_id: string;
  name: string;
  goal: string | null;
  audience: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export default function SequencesPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [notes, setNotes] = useState("");

  // load organisation safely
  async function loadOrganisation() {
    try {
      const res = await fetch("/api/social-accounts", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data?.organisationId) {
        throw new Error(data?.error || "Failed to load organisation");
      }

      setOrganisationId(data.organisationId);
      return data.organisationId;
    } catch (e: any) {
      setErr(e?.message || "Failed to load organisation");
      return null;
    }
  }

  async function loadSequences(orgId?: string) {
    const id = orgId || organisationId;
    if (!id) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/sequences?organisationId=${id}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load campaigns");
      }

      setSequences(data.sequences || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function init() {
      const org = await loadOrganisation();
      if (org) {
        loadSequences(org);
      }
    }
    init();
  }, []);

  async function create() {
    if (!organisationId) return;

    setLoading(true);
    setErr(null);

    try {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Campaign name is required.");

      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId,
          name: trimmed,
          goal: goal.trim() || null,
          audience: audience.trim() || null,
          notes: notes.trim() || null,
          status: "draft",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to create campaign");
      }

      setName("");
      setGoal("");
      setAudience("");
      setNotes("");

      loadSequences();
    } catch (e: any) {
      setErr(e?.message || "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">

        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Campaign Studio
            </h1>

            <p className="mt-1 text-sm text-slate-300">
              Plan a narrative → develop posts → send through Brainstorm and Quick Blast.
            </p>
          </div>

          <span className="text-xs text-slate-400 border border-slate-700 bg-slate-900/80 rounded-2xl px-3 py-2">
            Org workspace
          </span>
        </header>

        {/* Create campaign */}
        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-4">
          <h2 className="text-base font-semibold">Create a campaign</h2>

          <div className="grid md:grid-cols-2 gap-4">

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Campaign name
              </label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "Workplace burnout awareness"'
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Goal (optional)
              </label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Webinar signups"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Audience (optional)
              </label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. HR leaders"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Notes (optional)
              </label>
              <input
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal planning notes"
              />
            </div>

          </div>

          <button
            onClick={create}
            disabled={loading}
            className="inline-flex items-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Working…" : "Create campaign"}
          </button>

          {err && (
            <div className="text-[11px] text-red-400">{err}</div>
          )}
        </section>

        {/* Campaign list */}
        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your campaigns</h2>

            <button
              onClick={() => loadSequences()}
              className="text-xs text-slate-300 hover:text-slate-100"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="text-sm text-slate-400">Loading…</div>
          )}

          {!loading && sequences.length === 0 && (
            <div className="text-sm text-slate-400">
              No campaigns yet — create your first one above.
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">

            {sequences.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">

                  <div className="font-semibold">
                    {s.name}
                  </div>

                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {s.status}
                  </span>

                </div>

                {(s.goal || s.audience) && (
                  <div className="mt-1 text-[11px] text-slate-300 space-y-1">
                    {s.goal && <div>Goal: {s.goal}</div>}
                    {s.audience && <div>Audience: {s.audience}</div>}
                  </div>
                )}

                {s.notes && (
                  <div className="mt-2 text-[11px] text-slate-400">
                    {s.notes}
                  </div>
                )}

                <div className="mt-3 text-[10px] text-slate-500">
                  Created: {new Date(s.created_at).toLocaleString()}
                </div>

              </div>
            ))}

          </div>

        </section>

      </div>
    </div>
  );
}
