"use client";

import { useEffect, useState } from "react";

type ReplyRecord = {
  id: string;
  createdTime?: string;
  message_body?: string;
  platform?: string;
  direction?: string;
  status?: string;
};

export default function DashboardPage() {
  const [data, setData] = useState<ReplyRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // form state
  const [newMessage, setNewMessage] = useState(
    "Feeling stressed lately but want to take control of your health again?"
  );
  const [newPlatform, setNewPlatform] = useState("LinkedIn");

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

  // create content in Airtable (no status because Airtable complained)
  async function handleSaveToAirtable() {
    const body = {
      message_body: newMessage,
      platform: newPlatform,
      direction: "outbound",
    };

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (res.ok) {
      alert("✅ Saved to Airtable!");
      load();
    } else {
      alert("❌ Failed to save: " + JSON.stringify(json));
    }
  }

  // log reply
  async function handleLogReply() {
    const body = {
      message_body: newMessage,
      platform: newPlatform,
      direction: "outbound",
    };

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (res.ok) {
      alert("✅ Reply logged!");
      load();
    } else {
      alert("❌ Failed to log reply: " + JSON.stringify(json));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Root Health Ops Dashboard</h1>

      {/* Create / Log */}
      <section className="p-4 border rounded-xl bg-gray-50 space-y-4">
        <h2 className="text-xl font-semibold">Create new content / Log reply</h2>

        <div className="flex flex-col gap-3 max-w-xl">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Message text</span>
            <textarea
              className="border rounded-lg p-2 min-h-[90px]"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
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

          <div className="flex gap-3">
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
          </div>
        </div>
      </section>

      {/* Replies table */}
      <section className="p-4 border rounded-xl bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Replies Needed / Logged</h2>
          <button
            onClick={load}
            className="text-sm px-3 py-1 border rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading data...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-200 p-2 text-left">Platform</th>
                  <th className="border border-gray-200 p-2 text-left">Direction</th>
                  <th className="border border-gray-200 p-2 text-left">Status</th>
                  <th className="border border-gray-200 p-2 text-left">Message</th>
                  <th className="border border-gray-200 p-2 text-left">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.length > 0 ? (
                  data.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="border border-gray-200 p-2">
                        {row.platform || "-"}
                      </td>
                      <td className="border border-gray-200 p-2">
                        {row.direction || "-"}
                      </td>
                      <td className="border border-gray-200 p-2">
                        {row.status || "-"}
                      </td>
                      <td className="border border-gray-200 p-2 max-w-md">
                        {row.message_body || "-"}
                      </td>
                      <td className="border border-gray-200 p-2 whitespace-nowrap">
                        {row.createdTime
                          ? new Date(row.createdTime).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="border border-gray-200 p-3 text-center text-gray-500"
                      colSpan={5}
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
