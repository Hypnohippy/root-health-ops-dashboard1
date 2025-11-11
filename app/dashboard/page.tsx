"use client";

import { useEffect, useState } from "react";

// we'll normalise the Airtable shape on the client
type ReplyRecord = {
  id: string;
  createdTime?: string;
  fields: {
    ID?: string;
    Lead?: string;
    Platform?: string;
    direction?: string;
    ["message body"]?: string;
    ["created at"]?: string;
    ["sent by"]?: string;
    status?: string;
  };
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
    // json.records is what our /api/replies returned
    setData(json.records || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // ✅ save content to Airtable using your real field names
  async function handleSaveToAirtable() {
    const body = {
      // these keys must match Airtable exactly
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      // status: "ready", // leave out because Airtable rejected it
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

  // ✅ log reply with same field names
  async function handleLogReply() {
    const body = {
      "message body": newMessage,
      Platform: newPlatform,
      direction: "outbound",
      // status: "sent",
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
                  <th className="border border-gray-200 p-2 text-left">direction</th>
                  <th className="border border-gray-200 p-2 text-left">message body</th>
                  <th className="border border-gray-200 p-2 text-left">Lead</th>
                  <th className="border border-gray-200 p-2 text-left">status</th>
                  <th className="border border-gray-200 p-2 text-left">created</th>
                </tr>
              </thead>
              <tbody>
                {data.length > 0 ? (
                  data.map((row) => {
                    const f = row as any; // raw record
                    // because our /api/replies endpoint already flattened fields,
                    // your current response might be { id, createdTime, ...fields }
                    // so let's support both shapes:
                    const fields = (row as any).fields || (row as any);
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
                          {fields["Lead"] || "-"}
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
