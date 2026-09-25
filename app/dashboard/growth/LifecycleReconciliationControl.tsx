"use client";

import { useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";

type Summary = {
  contactsInspected: number;
  repairsApplied: number;
  skippedAmbiguousContacts: number;
  duplicatesAvoided: number;
  errors: string[];
};

export default function LifecycleReconciliationControl() {
  const inFlight = useRef(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const response = await tenantFetch("/api/growth/lifecycle/reconcile", { method: "POST", credentials: "same-origin" });
      const result = await response.json();
      if (result && ["contactsInspected", "repairsApplied", "skippedAmbiguousContacts", "duplicatesAvoided"].every(key => Number.isInteger(result[key]) && result[key] >= 0)
        && Array.isArray(result.errors) && result.errors.every((value: unknown) => typeof value === "string")) {
        setSummary(result);
        if (!response.ok && result.errors.length === 0) setError(`Request failed (HTTP ${response.status}).`);
      } else {
        setError(typeof result?.error === "string" ? result.error : `Unexpected reconciliation response (HTTP ${response.status}).`);
      }
    } catch {
      setError("Reconciliation result could not be confirmed. No automatic retry was made.");
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <details className="mt-4 rounded-lg border border-slate-700 p-3 text-sm">
      <summary className="cursor-pointer text-slate-300">Internal diagnostics</summary>
      <p className="my-2 text-slate-400">Manual lifecycle verification. Requires organisation write access.</p>
      <button type="button" onClick={run} disabled={running}
        className="rounded-lg border border-slate-600 px-3 py-2 text-white disabled:opacity-50">
        {running ? "Running lifecycle reconciliation…" : "Run lifecycle reconciliation"}
      </button>
      <div role="status" aria-live="polite" aria-busy={running} className="mt-2">
        {summary && <dl>
          <dt>Contacts inspected</dt><dd>{summary.contactsInspected}</dd>
          <dt>Repairs applied</dt><dd>{summary.repairsApplied}</dd>
          <dt>Skipped ambiguous contacts</dt><dd>{summary.skippedAmbiguousContacts}</dd>
          <dt>Duplicates avoided</dt><dd>{summary.duplicatesAvoided}</dd>
          <dt>Errors</dt><dd className="whitespace-pre-wrap">{summary.errors.length ? summary.errors.join("\n") : "None"}</dd>
        </dl>}
        {error && <p className="text-red-300">Errors: {error}</p>}
      </div>
    </details>
  );
}
