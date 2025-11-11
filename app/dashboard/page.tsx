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

  // ✅ Fetch replies from your /api/replies endpoint
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

  // ✅ Function: Save new content to Airtable
  async function handleSaveToAirtable(content: string, platform: string) {
    const body = {
      message_body: content,
      platform,
      direction: "outbound",
      status: "ready",
    };

    const res = await fetch("/api/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (res.ok) {
      alert("✅ Saved to Airtable!");
      load(); // refresh list
    } else {
      alert("❌ Failed to save: " + JSON.stringify(json));
    }
  }

  // ✅ Function: Log a reply to Airtable
  async function handleLogReply(message: string, platform: string) {
    const body = {
      message_body: message,
      platform,
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
      alert("✅ Reply logged!");
      load(); // refresh list
    } else {
      alert("❌ Failed to log reply: " + JSON.stringify(json));
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Root Health Ops Dashboard</h1>

      {/* --- Create New Content --- */}
      <section className="p-4 border rounded-xl bg-gray-50 space-y-3">
        <h2 className="text-xl font-semibold">Create new content</h2>
        <p className="text-sm text-gray-600">
          Quick test buttons to send sample content to Airtable.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              handleSaveToAirtable(
                "Feeling stressed lately but want to take control of your health again?",
                "LinkedIn"
              )
            }
            className="rounded-lg bg-green-600 text-white px-4 py-2 hover:bg-green-700"
          >
            Save to Airtable
          </button>

          <button
            onClick={() =>
              handleLogReply(
                "Thanks for reaching out! Take control of your health with Root Health.",
                "Reddit"
              )
            }
            className="rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
          >
            Log Reply
          </button>
        </div>
      </section>

      {/* --- Replies Table --- */}
      <section className="p-4 border rounded-xl bg-white">
        <h2 className="text-xl font-semibold mb-3">Replies Needed / Logged</h2>
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
                      <td className="border border-gray-200 p-2">
                        {row.message_body || "-"}
                      </td>
                      <td className="border border-gray-200 p-2">
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
