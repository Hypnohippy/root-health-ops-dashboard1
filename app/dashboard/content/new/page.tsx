// app/dashboard/content/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import MediaDropzone from "../../components/MediaDropzone";
import ContentForm from "../../stories/new/ContentForm"; // if your ContentForm is elsewhere, change this import

type UploadedMedia = {
  url: string;
  path?: string;
  contentType?: string;
  size?: number;
};

export default function NewContentPage() {
  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Keep the name mediaIds to avoid rippling changes elsewhere,
  // but we store URLs (public Supabase URLs) inside it.
  const [mediaIds, setMediaIds] = useState<string[]>([]);

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
    setMediaIds((prev) => prev.filter((x) => x !== url));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">New Content</h1>
          <p className="text-sm text-slate-300">
            Upload media (image/video) then create content using those links.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Media</div>
            <div className="text-[11px] text-slate-400">
              {loadingOrg ? "Loading organisation…" : organisationId ? "Ready" : "No organisation found"}
            </div>
          </div>

          <MediaDropzone
            organisationId={organisationId || ""}
            onUploaded={(media: UploadedMedia) => {
              // ✅ FIX: UploadedMedia has no `id` — use url (or path)
              const u = String(media?.url || "").trim();
              if (!u) return;
              setMediaIds((prev) => (prev.includes(u) ? prev : [...prev, u]));
            }}
            disabled={!canUpload}
          />

          {mediaIds.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-slate-300">Attached media:</div>

              <div className="space-y-2">
                {mediaIds.map((u) => (
                  <div
                    key={u}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-950/60 px-3 py-2"
                  >
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] text-emerald-300 hover:text-emerald-200 break-all"
                    >
                      {u}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeMedia(u)}
                      className="rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-500">
            Tip: If you’re uploading videos, keep them under your bucket limit (you said 50MB).
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900/80 p-5">
          <ContentForm
            organisationId={organisationId || ""}
            mediaIds={mediaIds}
          />
        </section>
      </div>
    </div>
  );
}
