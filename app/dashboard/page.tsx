"use client";

import { useEffect, useState } from "react";

type AirtableRecord = {
  id: string;
  createdTime?: string;
  [key: string]: any;
};

export default function DashboardPage() {
  const [data, setData] = useState<AirtableRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // editor
  const [newMessage, setNewMessage] = useState(
    "Feeling stressed lately but want to take control of your health again?"
  );
  const [newPlatform, setNewPlatform] = useState("LinkedIn");

  // filters
  const [filterPlatform, setFilterPlatform] = useState("");
  const [filterDirection, setFilterDirection] = useState("");

  // toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // fetch data
  async function load() {
    setLoading(true);
    const res = await fetch("/api/replies", { cache: "no-store" });
    const json = await res.json();
    setData(json.records || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // auto-refresh
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // save
  async function handleSaveToAirtable() {
    const body = {
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      status: "to_post",
    };

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (res.ok) {
      showToast("success", "Saved to Airtable");
      load();
    } else {
      showToast("error", "Failed to save: " + JSON.stringify(json));
    }
  }

  // log reply
  async function handleLogReply() {
    const body = {
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      status: "sent",
    };

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (res.ok) {
      showToast("success", "Reply logged");
      load();
    } else {
      showToast("error", "Failed to log: " + JSON.stringify(json));
    }
  }

  // AI draft
  async function handleAIDraft() {
    const res = await fetch("/api/ai/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceText: newMessage,
        platform: newPlatform,
        style: "warm, human, founder, not apologetic",
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setNewMessage(json.draft);
      showToast("success", "AI draft created");
    } else {
      showToast("error", "AI failed: " + JSON.stringify(json));
    }
  }

  // load a draft card into editor
  function loadDraftIntoEditor(record: any) {
    const fields = record.fields || record;
    setNewMessage(fields["message body"] || "");
    setNewPlatform(fields["Platform"] || "LinkedIn");
    showToast("success", "Draft loaded into editor");
  }

  // mark sent
  async function handleMarkSent(id: string) {
    const res = await fetch(`/api/replies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast("success", "Marked as sent");
      load();
    } else {
      showToast("error", "Failed to update: " + JSON.stringify(json));
    }
  }

  // filter
  const filtered = data.filter((row) => {
    const f = (row as any).fields || row;
    const p = f["Platform"] || "";
    const d = f["direction"] || "";
    if (filterPlatform && p !== filterPlatform) return false;
    if (filterDirection && d !== filterDirection) return false;
    return true;
  });

  // status colours
  function statusColor(status?: string) {
    switch (status) {
      case "to_post":
        return "bg-amber-500/20 text-amber-100 border border-amber-500/30";
      case "drafted":
        return "bg-purple-500/20 text-purple-100 border border-purple-500/30";
      case "sent":
      case "posted":
        return "bg-emerald-500/20 text-emerald-100 border border-emerald-500/30";
      case "needs_reply":
        return "bg-rose-500/20 text-rose-100 border border-rose-500/30";
      default:
        return "bg-slate-500/20 text-slate-100 border border-slate-500/30";
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50 p-6 space-y-6">
      {/* toast */}
      {toast ? (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-white shadow-lg ${
            toast.type === "success" ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Root Health Ops Dashboard
          </h1>
          <p className="text-slate-300 text-sm mt-1">
            Your cockpit for content, replies and automations.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sm border border-white/10"
        >
          Refresh
        </button>
      </header>

      {/* editor card */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold">Create / log content</h2>
        <div className="flex flex-col gap-3 max-w-2xl">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-200">
              Message text
            </span>
            <textarea
              className="bg-slate-950/40 border border-white/10 rounded-xl p-3 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 w-56">
            <span className="text-xs uppercase tracking-wide text-slate-200">
              Platform
            </span>
            <select
              className="bg-slate-950/40 border border-white/10 rounded-xl p-2 focus:outline-none"
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
            >
              <option value="LinkedIn">LinkedIn</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook">Facebook</option>
              <option value="Reddit">Reddit</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveToAirtable}
              className="rounded-lg bg-emerald-500 text-slate-950 px-4 py-2 text-sm font-medium hover:bg-emerald-400"
            >
              Save to Airtable
            </button>
            <button
              onClick={handleLogReply}
              className="rounded-lg bg-indigo-400 text-slate-950 px-4 py-2 text-sm font-medium hover:bg-indigo-300"
            >
              Log Reply
            </button>
            <button
              onClick={handleAIDraft}
              className="rounded-lg bg-fuchsia-500 text-slate-50 px-4 py-2 text-sm font-medium hover:bg-fuchsia-400"
            >
              AI draft
            </button>
          </div>
        </div>
      </section>

      {/* drafted posts */}
      <section className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3">
        <h2 className="text-base font-semibold text-slate-50">
          AI drafted posts
        </h2>
        <p className="text-xs text-slate-300">
          These come from Airtable records with <code>status = drafted</code>.
        </p>
        <div className="flex gap-3 flex-wrap">
          {data
            .filter((r) => {
              const f = (r as any).fields || r;
              return f["status"] === "drafted";
            })
            .map((r) => {
              const f = (r as any).fields || r;
              return (
                <div
                  key={r.id}
                  className="bg-slate-950/30 border border-white/10 rounded-xl p-3 max-w-sm space-y-2"
                >
                  <p className="text-sm text-slate-50">
                    {f["message body"]
                      ? f["message body"].slice(0, 130)
                      : "No text"}
                    {f["message body"] && f["message body"].length > 130
                      ? "..."
                      : ""}
                  </p>
                  <p className="text-[10px] uppercase text-slate-400 tracking-wide">
                    {f["Platform"] || "—"}
                  </p>
                  <button
                    onClick={() => loadDraftIntoEditor(r)}
                    className="text-xs px-3 py-1 bg-slate-50 text-slate-900 rounded-lg hover:bg-slate-200"
                  >
                    Load into editor
                  </button>
                </div>
              );
            })}
          {data.filter((r) => ((r as any).fields || r)["status"] === "drafted")
            .length === 0 ? (
            <p className="text-sm text-slate-300">No AI drafts yet.</p>
          ) : null}
        </div>
      </section>

      {/* filters */}
      <section className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <select
            className="bg-white/5 border border-white/10 rounded-lg p-1 text-sm"
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
          >
            <option value="">All platforms</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Instagram">Instagram</option>
            <option value="TikTok">TikTok</option>
            <option value="Facebook">Facebook</option>
            <option value="Reddit">Reddit</option>
          </select>
          <select
            className="bg-white/5 border border-white/10 rounded-lg p-1 text-sm"
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
          >
            <option value="">All directions</option>
            <option value="outbound">outbound</option>
            <option value="inbound">inbound</option>
          </select>
        </div>
        <p className="text-xs text-slate-400">Auto-refresh every 30s</p>
      </section>

      {/* conversation cards */}
      <section className="space-y-4 pb-10">
        {loading ? (
          <p className="text-slate-200">Loading data…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400">No records yet.</p>
        ) : (
          filtered.map((row) => {
            const f = (row as any).fields || row;
            return (
              <div
                key={row.id}
                className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4 shadow-lg space-y-3"
              >
                {/* header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-950/40 border border-white/10">
                      {f["Platform"] || "Unknown"}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full uppercase tracking-wide ${statusColor(
                        f["status"]
                      )}`}
                    >
                      {f["status"] || "—"}
                    </span>
                    {f["direction"] ? (
                      <span className="text-[10px] uppercase text-slate-300">
                        {f["direction"]}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {f["created at"]
                      ? f["created at"]
                      : row.createdTime
                      ? new Date(row.createdTime).toLocaleString()
                      : ""}
                  </span>
                </div>

                {/* original/context if present */}
                {f["Original post / context"] ? (
                  <div className="bg-slate-950/30 border border-white/5 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-slate-400 mb-1">
                      Original
                    </p>
                    <p className="text-sm text-slate-50">
                      {f["Original post / context"]}
                    </p>
                  </div>
                ) : null}

                {/* our message */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase text-slate-400">
                    Your message
                  </p>
                  <p className="text-sm text-slate-50 whitespace-pre-line">
                    {f["message body"] || "—"}
                  </p>
                </div>

                {/* external link */}
                {f["Post URL"] ? (
                  <a
                    href={f["Post URL"]}
                    target="_blank"
                    className="text-xs text-indigo-200 underline"
                  >
                    View on {f["Platform"]} ↗
                  </a>
                ) : null}

                {/* actions */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => loadDraftIntoEditor(row)}
                    className="text-xs px-3 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10"
                  >
                    Edit in editor
                  </button>
                  <button
                    onClick={() => handleMarkSent(row.id)}
                    className="text-xs px-3 py-1 rounded-lg bg-slate-950 text-slate-50 hover:bg-slate-800"
                  >
                    Mark sent
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
