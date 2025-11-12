"use client";

import { useEffect, useState } from "react";

type RecordT = {
  id: string;
  fields: Record<string, any>;
};

export default function CampaignsPage() {
  const [records, setRecords] = useState<RecordT[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/campaigns", { cache: "no-store" });
    const json = await res.json();
    setRecords(json.records || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = records.filter((r) => {
    const p = r.fields.platform || "";
    const s = r.fields.status || "";
    if (filterPlatform && p !== filterPlatform) return false;
    if (filterStatus && s !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-6 text-slate-50">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <div className="flex gap-3">
          <a
            href="/dashboard/campaigns/new"
            className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + New Campaign
          </a>
          <button
            onClick={load}
            className="bg-white/10 border border-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="bg-white/5 border border-white/10 rounded-lg p-2 text-sm"
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
        >
          <option value="">All platforms</option>
          <option>Meta (Facebook/IG)</option>
          <option>Google</option>
          <option>LinkedIn</option>
        </select>
        <select
          className="bg-white/5 border border-white/10 rounded-lg p-2 text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>draft</option>
          <option>queued_to_publish</option>
          <option>published</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
        <table className="w-full text-sm">
          <thead className="text-slate-300">
            <tr className="text-left">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Platform</th>
              <th className="py-2 pr-4">Objective</th>
              <th className="py-2 pr-4">Budget (£/day)</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Dates</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-3 text-slate-300">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-3 text-slate-300">No campaigns yet.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="py-2 pr-4">{r.fields.name || "—"}</td>
                  <td className="py-2 pr-4">{r.fields.platform || "—"}</td>
                  <td className="py-2 pr-4">{r.fields.objective || "—"}</td>
                  <td className="py-2 pr-4">{r.fields.budget_daily || "—"}</td>
                  <td className="py-2 pr-4">
                    <span className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">
                      {r.fields.status || "—"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    {r.fields.start_date
                      ? new Date(r.fields.start_date).toLocaleDateString()
                      : "—"}{" "}
                    -{" "}
                    {r.fields.end_date
                      ? new Date(r.fields.end_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <a
                      href="/dashboard/campaigns/new"
                      className="text-indigo-200 underline text-xs"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
