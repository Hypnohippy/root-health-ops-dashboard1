"use client";

import { useEffect, useState } from "react";

// we keep it loose because Airtable can return flattened or fields{}
type AirtableRecord = {
  id: string;
  createdTime?: string;
  [key: string]: any;
};

export default function DashboardPage() {
  const [data, setData] = useState<AirtableRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
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

  // load from /api/replies
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

  // auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // SAVE → creates a row the Make scenario can post
  async function handleSaveToAirtable() {
    const body = {
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      status: "to_post", // we added this in Airtable
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

  // LOG → for “I replied already, log it”
  async function handleLogReply() {
    const body = {
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      status: "sent", // you said you have this
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

  // AI → get draft from /api/ai/reply
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

  // mark as sent → PATCH /api/replies/[id]
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

  // client-side filters
  const filtered = data.filter((row) => {
    const fields = (row as any).fields || row;
    const platform = fields["Platform"] || "";
    const direction = fields["direction"] || "";
    if (filterPlatform && platform !== filterPlatform) return false;
    if (filterDirection && direction !== filterDirection) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6 relative">
      {/* toast */}
      {toast ? (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      <h1 className="text-3xl font-bold">Root Health Ops Dashboard</h1>

      {/* form */}
      <section className="p-4 border rounded-xl bg-gray-50 space-y-4">
        <h2 className="text-xl font-semibold">Create / log content</h2>

        <div className="flex flex-col gap-3 max-w-xl">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Message text</span>
            <textarea
              className="border rounded-lg p-2 min-h-[90px]"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Write the reply or post content..."
            />
          </label>

          <label className="flex flex-col gap-1 w-48">
            <span className="text-sm font-medium">Platform</span>
            <select
              className="border rounded-lg p-2"
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
              className="rounded-lg bg-green-600 text-white px-4 py-2 hover:bg-green-700"
            >
              Save to Airtable
            </button>
            <button
              onClick={handleLogReply}
              className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
            >
              Log Reply
            </button>
            <button
              onClick={handleAIDraft}
              className="rounded-lg bg-purple-600 text-white px-4 py-2 hover:bg-purple-700"
            >
              AI draft
            </button>
          </div>
        </div>
      </section>

      {/* table */}
      <section className="p-4 border rounded-xl bg-white space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Replies / content</h2>
          <div className="flex gap-2">
            <select
              className="border rounded-lg p-1 text-sm"
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
              className="border rounded-lg p-1 text-sm"
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
            >
              <option value="">All directions</option>
              <option value="outbound">outbound</option>
              <option value="inbound">inbound</option>
            </select>
            <button
              onClick={load}
              className="text-sm px-3 py-1 border rounded-lg hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <p>Loading data...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-200 p-2 text-left">Platform</th>
                  <th className="border border-gray-200 p-2 text-left">direction</th>
                  <th className="border border-gray-200 p-2 text-left">message body</th>
                  <th className="border border-gray-200 p-2 text-left">status</th>
                  <th className="border border-gray-200 p-2 text-left">created</th>
                  <th className="border border-gray-200 p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map((row) => {
                    const fields = (row as any).fields || row;
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 p-2">
                          {fields["Platform"] || "-"}
                        </td>
                        <td className="border border-gray-200 p-2">
                          {fields["direction"] || "-"}
                        </td>
                        <td className="border border-gray-200 p-2 max-w-md">
                          {fields["message body"] || "-"}
                        </td>
                        <td className="border border-gray-200 p-2">
                          {fields["status"] || "-"}
                        </td>
                        <td className="border border-gray-200 p-2 whitespace-nowrap">
                          {fields["created at"]
                            ? fields["created at"]
                            : row.createdTime
                            ? new Date(row.createdTime).toLocaleString()
                            : "-"}
                        </td>
                        <td className="border border-gray-200 p-2">
                          <button
                            onClick={() => handleMarkSent(row.id)}
                            className="text-xs px-3 py-1 bg-black text-white rounded hover:bg-gray-800"
                          >
                            Mark sent
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      className="border border-gray-200 p-3 text-center text-gray-500"
                      colSpan={6}
                    >
                      No records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
