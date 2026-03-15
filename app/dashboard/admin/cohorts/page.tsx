"use client";

import React, { useEffect, useMemo, useState } from "react";

type CohortRow = {
  id: string;
  college_name: string;
  cohort_name: string;
  cohort_code: string;
  slug: string | null;
  discount_percent: number | null;
  discount_months: number | null;
  max_redemptions: number | null;
  redemptions_used: number | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean | null;
  notes: string | null;
  stripe_coupon_id: string | null;
  created_at: string;
  updated_at?: string | null;
};

function norm(v: any) {
  return String(v || "").trim();
}

function slugify(input: string) {
  return norm(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default function AdminCohortsPage() {
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rows, setRows] = useState<CohortRow[]>([]);

  const [collegeName, setCollegeName] = useState("Kings College London");
  const [cohortName, setCohortName] = useState("September 2026 Intake");
  const [cohortCode, setCohortCode] = useState("KINGS-SEP26");
  const [slug, setSlug] = useState("kings-sep26");
  const [discountPercent, setDiscountPercent] = useState("50");
  const [discountMonths, setDiscountMonths] = useState("6");
  const [maxRedemptions, setMaxRedemptions] = useState("40");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [stripeCouponId, setStripeCouponId] = useState("college60");
  const [notes, setNotes] = useState("Supported start cohort");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadCohorts();
  }, []);

  useEffect(() => {
    const autoSlug = slugify(
      `${collegeName.replace(/college|university|london/gi, "").trim()} ${cohortName}`
    );
    if (autoSlug) setSlug(autoSlug);
  }, [collegeName, cohortName]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const cohortLink = useMemo(() => "/cohort", []);

  async function loadCohorts() {
    setTableLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "GET",
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to load cohorts.");
      }

      setRows(Array.isArray(data?.cohorts) ? data.cohorts : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load cohorts.");
    } finally {
      setTableLoading(false);
    }
  }

  async function createCohort(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setToast(null);

    try {
      const payload = {
        college_name: norm(collegeName),
        cohort_name: norm(cohortName),
        cohort_code: norm(cohortCode).toUpperCase(),
        slug: slugify(slug || `${collegeName}-${cohortName}`),
        discount_percent: Number(discountPercent || 50),
        discount_months: Number(discountMonths || 6),
        max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
        starts_at: startsAt || null,
        expires_at: expiresAt || null,
        is_active: isActive,
        notes: norm(notes),
        stripe_coupon_id: norm(stripeCouponId),
      };

      const res = await fetch("/api/admin/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to create cohort.");
      }

      setToast("Cohort created ✅");
      setCollegeName("");
      setCohortName("");
      setCohortCode("");
      setSlug("");
      setDiscountPercent("50");
      setDiscountMonths("6");
      setMaxRedemptions("40");
      setStartsAt("");
      setExpiresAt("");
      setStripeCouponId("college60");
      setNotes("Supported start cohort");
      setIsActive(true);

      await loadCohorts();
    } catch (e: any) {
      setError(e?.message || "Failed to create cohort.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(row: CohortRow) {
    setError(null);
    try {
      const res = await fetch("/api/admin/cohorts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          is_active: !row.is_active,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update cohort.");
      }

      setToast(`Cohort ${row.is_active ? "paused" : "activated"} ✅`);
      await loadCohorts();
    } catch (e: any) {
      setError(e?.message || "Failed to update cohort.");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <section className="space-y-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
          Admin
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-50">
          Cohort manager
        </h1>
        <p className="max-w-3xl text-sm md:text-base text-slate-300 leading-relaxed">
          Create and manage private college cohort codes without touching SQL.
          Students use the cohort page, enter their code, and checkout applies
          the approved college discount automatically.
        </p>
      </section>

      {toast ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {toast}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form
          onSubmit={createCohort}
          className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 space-y-6"
        >
          <div>
            <h2 className="text-xl font-semibold text-slate-50">
              Create new cohort
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              This creates a private cohort code linked to your Stripe college
              coupon.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>College name</FieldLabel>
              <Input
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g. Kings College London"
              />
            </div>

            <div>
              <FieldLabel>Cohort name</FieldLabel>
              <Input
                value={cohortName}
                onChange={(e) => setCohortName(e.target.value)}
                placeholder="e.g. September 2026 Intake"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Cohort code</FieldLabel>
              <Input
                value={cohortCode}
                onChange={(e) => setCohortCode(e.target.value.toUpperCase())}
                placeholder="e.g. KINGS-SEP26"
              />
            </div>

            <div>
              <FieldLabel>Slug</FieldLabel>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. kings-sep26"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <FieldLabel>Discount %</FieldLabel>
              <Input
                type="number"
                min="1"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Months</FieldLabel>
              <Input
                type="number"
                min="1"
                value={discountMonths}
                onChange={(e) => setDiscountMonths(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Max seats</FieldLabel>
              <Input
                type="number"
                min="1"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Stripe coupon ID</FieldLabel>
              <Input
                value={stripeCouponId}
                onChange={(e) => setStripeCouponId(e.target.value)}
                placeholder="e.g. college60"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Starts at</FieldLabel>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Expires at</FieldLabel>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Notes</FieldLabel>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this cohort"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              id="cohort-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-400"
            />
            <label htmlFor="cohort-active" className="text-sm text-slate-300">
              Active immediately
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-full bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Creating…" : "Create cohort"}
            </button>

            <button
              type="button"
              onClick={loadCohorts}
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Refresh list
            </button>
          </div>
        </form>

        <div className="rounded-[32px] border border-white/10 bg-black/20 p-6 md:p-8 space-y-5">
          <h2 className="text-xl font-semibold text-slate-50">
            Sharing instructions
          </h2>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Send colleges this page
            </div>
            <div className="mt-2 text-sm text-slate-100">{cohortLink}</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              Example message
            </div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {`Please ask students to visit ${cohortLink} and enter their cohort code: ${norm(
                cohortCode
              ).toUpperCase() || "YOUR-CODE-HERE"}.

Their supported-start pricing will be applied automatically if the code is valid.`}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300 leading-relaxed">
            Keep the public pricing page clean. Only approved students should be
            sent to the cohort page with their cohort code.
          </div>
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">
              Existing cohorts
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Live list of private college cohorts and seat usage.
            </p>
          </div>
        </div>

        {tableLoading ? (
          <div className="mt-6 text-sm text-slate-400">Loading cohorts…</div>
        ) : rows.length === 0 ? (
          <div className="mt-6 text-sm text-slate-400">No cohorts yet.</div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-3 font-semibold">College</th>
                  <th className="px-3 py-3 font-semibold">Cohort</th>
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Discount</th>
                  <th className="px-3 py-3 font-semibold">Seats</th>
                  <th className="px-3 py-3 font-semibold">Coupon</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 text-slate-200"
                  >
                    <td className="px-3 py-4">{row.college_name}</td>
                    <td className="px-3 py-4">{row.cohort_name}</td>
                    <td className="px-3 py-4 font-mono text-emerald-200">
                      {row.cohort_code}
                    </td>
                    <td className="px-3 py-4">
                      {row.discount_percent}% / {row.discount_months} months
                    </td>
                    <td className="px-3 py-4">
                      {row.redemptions_used ?? 0}
                      {row.max_redemptions ? ` / ${row.max_redemptions}` : ""}
                    </td>
                    <td className="px-3 py-4">{row.stripe_coupon_id || "—"}</td>
                    <td className="px-3 py-4">
                      {row.is_active ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-[12px] font-semibold text-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-500/15 px-3 py-1 text-[12px] font-semibold text-slate-300">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-white/10"
                      >
                        {row.is_active ? "Pause" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
