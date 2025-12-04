"use client";

import { useState } from "react";
import MediaDropzone from "@/app/dashboard/components/MediaDropzone";

export default function NewContentPage() {
  // TODO: get this from Supabase auth + organisation_members
  const organisationId = "REPLACE_WITH_ORG_ID_FOR_NOW";

  const [body, setBody] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId,
        body,
        mediaIds,
        platform: "facebook",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || "Failed to save");
    } else {
      setMessage("Saved! (Next step: hook to Make / posting)");
      setBody("");
      setMediaIds([]);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-2">New Post</h1>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Caption / story</span>
        <textarea
          className="w-full border rounded-lg p-2 min-h-[150px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the story / ad copy here..."
        />
      </label>

      <div>
        <span className="text-sm font-medium">Media</span>
        <MediaDropzone
          organisationId={organisationId}
          onUploaded={(media) =>
            setMediaIds((prev) => [...prev, media.id])
          }
        />
        {mediaIds.length > 0 && (
          <p className="text-sm text-gray-600 mt-1">
            {mediaIds.length} file(s) attached.
          </p>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save post"}
      </button>

      {message && <p className="text-sm mt-2">{message}</p>}
    </div>
  );
}
