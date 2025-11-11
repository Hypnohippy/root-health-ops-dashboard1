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

  // editor state
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

  // load from API
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

  async function handleAIDraft() {
    const res = await fetch("/api/ai/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceText: newMessage,
        platform: newPlatform,
        style: "warm, human, not salesy",
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

  function loadDraftIntoEditor(record: any) {
    const fields = record.fields || record;
    setNewMessage(fields["message body"] || "");
    setNewPlatform(fields["Platform"] || "LinkedIn");
    showToast("success", "Draft loaded into editor");
  }

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

  // filtered data
  const filtered = data.filter((row) => {
    const fields = (row as any).fields || row;
    const platform = fields["Platform"] || "";
    const direction = fields["direction"] || "";
    if (filterPlatform && platform !== filterPlatform) return false;
    if (filterDirection && direction !== filterDirection) return false;
    return true;
  });

  // little helpers for UI
  function statusColor(status?: string) {
    switch (status) {
      case "to_post":
        return "bg-amber-100 text-amber-700";
      case "drafted":
        return "bg-purple-100 text-purple-700";
      case "sent":
        return "bg-green-100 text-green-700";
      case "posted":
        return "bg-green-100 text-green-700";
      case "needs_reply":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-600";
    }
  }

  return (
    <div className="p-6 space-y-6 relative bg-slate-50 min-h-screen">
      {/* toast */}
      {toast ? (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <h1 className="text-3xl font-bold tracking-tight">Root Health Ops Dashboard</h1>

      {/* editor */}
      <section className="p-4 border rounded-xl bg-white shadow-sm space-y-4">
        <h2 className="text-xl font-semibold">Create / log content</h2>

        <div className="flex flex-col gap-3 max-w-xl">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Message text</span>
            <textarea
              className="border rounded-lg p-2 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 w-48">
            <span className="text-sm font-medium text-slate-700">Platform</span>
            <select
              className="border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
            >
              <option value="LinkedIn">LinkedIn</option>
              <option value="Reddit">Reddit</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="Facebook">Facebook</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveToAirtable}
              className="rounded-lg bg-green-600 text-white px-4 py-2 hover:bg-green-700 text-sm"
            >
              Save to Airtable
            </button>
            <button
              onClick={handleLogReply}
              className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 text-sm"
            >
              Log Reply
            </button>
            <button
              onClick={handleAIDraft}
              className="rounded-lg bg-purple-600 text-white px-4 py-2 hover:bg-purple-700 text-sm"
            >
              AI draft
            </button>
          </div>
        </div>
      </section>

      {/* AI drafted posts strip */}
      <section className="p-4 border rounded-xl bg-white shadow-sm space-y-3">
        <h2 className="text-lg font-semibold">AI drafted posts</h2>
        <p className="text-sm text-slate-500">
          These are rows in Airtable with status = <code>drafted</code>. Click one to load it into the editor above.
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
                    className="border rounded-lg p-3 bg-slate-50 flex flex-col gap-2 max-w-sm"
                >
                  <p className="text-sm text-slate-700">
                    {f["message body"] ? f["message body"].slice(0, 140) : "No text"}
                    {f["message body"] && f["message body"].length > 140 ? "..." : ""}
                  </p>
                  <p className="text-xs text-slate-400">
                    Platform: {f["Platform"] || "—"}
                  </p>
                  <button
                    onClick={() => loadDraftIntoEditor(r)}
                    className="text-xs px-3 py-1 bg-slate-900 text-white rounded hover:bg-slate-800 self-start"
                  >
                    Load into editor
                  </button>
                </div>
              );
            })}
          {data.filter((r) => ((r as any).fields || r)["status"] === "drafted").length === 0 ? (
            <p className="text-sm text-slate-400">No AI drafts yet.</p>
          ) : null}
        </div>
      </section>

      {/* filters */}
      <section className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <select
            className="border rounded-lg p-1 text-sm bg-white"
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
          >
            <option value="">All platforms</option>
            <option value="LinkedIn">LinkedIn</option>
            <option value="Reddit">Reddit</option>
            <option value="Instagram">Instagram</option>
            <option value="TikTok">TikTok</option>
            <option value="Facebook">Facebook</option>
          </select>
          <select
            className="border rounded-lg p-1 text-sm bg-white"
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
          >
            <option value="">All directions</option>
            <option value="outbound">outbound</option>
            <option value="inbound">inbound</option>
          </select>
        </div>
        <button
          onClick={load}
          className="text-sm px-3 py-1 border rounded-lg hover:bg-white"
        >
          Refresh
        </button>
      </section>

      {/* pretty card list */}
      <section className="space-y-4">
        {loading ? (
          <p className="text-slate-500">Loading data...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400">No records yet.</p>
        ) : (
          filtered.map((row) => {
            const f = (row as any).fields || row;
            return (
              <div
                key={row.id}
                className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-3"
              >
                {/* header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {f["Platform"] || "Unknown"}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${statusColor(
                        f["status"]
                      )}`}
                    >
                      {f["status"] || "—"}
                    </span>
                    {f["direction"] ? (
                      <span className="text-xs text-slate-400">
                        {f["direction"]}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-slate-400">
                    {f["created at"]
                      ? f["created at"]
                      : row.createdTime
                      ? new Date(row.createdTime).toLocaleString()
                      : ""}
                  </span>
                </div>

                {/* original post / context */}
                {f["Original post / context"] ? (
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <p className="text-xs uppercase text-slate-400 mb-1">
                      Original
                    </p>
                    <p className="text-sm text-slate-700">
                      {f["Original post / context"]}
                    </p>
                  </div>
                ) : null}

                {/* our message (AI or manual) */}
                <div className="space-y-1">
                  <p className="text-xs uppercase text-slate-400">Your message</p>
                  <p className="text-sm text-slate-800 whitespace-pre-line">
                    {f["message body"] || "—"}
                  </p>
                </div>

                {/* link */}
                {f["Post URL"] ? (
                  <a
                    href={f["Post URL"]}
                    target="_blank"
                    className="text-xs text-blue-600 underline w-fit"
                  >
                    View original post ↗
                  </a>
                ) : null}

                {/* actions */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => loadDraftIntoEditor(row)}
                    className="text-xs px-3 py-1 border rounded-lg hover:bg-slate-50"
                  >
                    Edit in editor
                  </button>
                  <button
                    onClick={() => handleMarkSent(row.id)}
                    className="text-xs px-3 py-1 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
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
