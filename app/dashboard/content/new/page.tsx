// app/dashboard/content/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import MediaDropzone from "../../components/MediaDropzone";

type UploadedMedia = {
  url: string;
  path?: string;
  contentType?: string;
  size?: number;
};

export default function NewContentPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Store public URLs here (images/videos)
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoadingOrg(true);
      try {
        const res = await fetch("/api/social-accounts", { cache: "no-store" });
        const data: any = await res.json().catch(() => null);

        const org =
          typeof data?.organisationId === "string"
            ? data.organisationId
            : typeof data?.organisation_id === "string"
            ? data.organisation_id
            : null;

        setOrganisationId(org);
      } catch {
        setOrganisationId(null);
      } finally {
        setLoadingOrg(false);
      }
    })();
  }, []);

  const canUpload = useMemo(() => !!organisationId && !loadingOrg, [organisationId, loadingOrg]);

  const removeMedia = (url: string) => {
    setMediaUrls((prev) => prev.filter((x) => x !== url));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied ✅");
    } catch {
      // fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("Copied ✅");
      } catch {
        alert("Could not copy. Please copy manually.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">New Content</h1>
          <p className="text-sm text-slate-300">
            Upload images/videos into Supabase Storage, then copy the public URL into Quick Blast / Stories.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Upload media</div>
            <div className="text-[11px] text-slate-400">
              {loadingOrg ? "Loading organisation…" : organisationId ? "Ready" : "No organisation found"}
            </div>
          </div>

          {!canUpload ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
              {loadingOrg
                ? "Loading your organisation…"
                : "No organisation found yet. Go to Org Setup / Billing, then come back here."}
            </div>
          ) : (
            <MediaDropzone
              organisationId={organisationId || ""}
              onUploaded={(media: UploadedMedia) => {
                const u = String(media?.url || "").trim();
                if (!u) return;
                setMediaUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
              }}
            />
          )}

          <div className="text-[11px] text-slate-500">
            Videos: if you see <b>413</b>, that’s almost always a request-size limit in Vercel/Next route handling
            (even if Supabase allows 50MB). We’ll fix that by switching to a browser → Supabase direct upload flow.
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
          <h2 className="text-base font-semibold">Uploaded media URLs</h2>

          {mediaUrls.length === 0 ? (
            <div className="text-sm text-slate-400">No uploads yet — drop a file above.</div>
          ) : (
            <div className="space-y-2">
              {mediaUrls.map((u) => (
                <div
                  key={u}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-2"
                >
                  <a
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] text-emerald-300 hover:text-emerald-200 break-all"
                  >
                    {u}
                  </a>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(u)}
                      className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMedia(u)}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] text-slate-500">
            Copy a URL → paste it into Quick Blast’s Image/Video field (depending on what you’re posting).
          </div>
        </section>
      </div>
    </div>
  );
}
