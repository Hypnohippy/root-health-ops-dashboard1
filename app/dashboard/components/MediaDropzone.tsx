// app/dashboard/components/MediaDropzone.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";

type UploadResult = {
  success: boolean;
  url?: string;
  path?: string;
  bucket?: string;
  mime?: string;
  error?: string;
};

type Props = {
  title?: string;
  helperText?: string;
  accept?: string; // e.g. "image/*" or "video/mp4,video/quicktime"
  value?: string;
  onChange: (url: string) => void;
};

export default function MediaDropzone({
  title = "Upload media",
  helperText = "Drag & drop a file here, or click to choose.",
  accept = "image/*",
  value = "",
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = useMemo(() => (accept || "").includes("video"), [accept]);

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
      });

      const json: UploadResult = await res.json().catch(() => null as any);

      if (!json?.success || !json?.url) {
        throw new Error(json?.error || "Upload failed.");
      }

      onChange(json.url);
    } catch (e: any) {
      setError(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void uploadFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    void uploadFile(f);
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="text-[11px] text-slate-400">{helperText}</div>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-full bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10 disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Choose file"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onPick}
          className="hidden"
        />
      </div>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "cursor-pointer rounded-2xl border border-dashed px-4 py-6 text-sm",
          dragOver
            ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
            : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-white/5",
        ].join(" ")}
      >
        {busy ? (
          <div>Uploading…</div>
        ) : (
          <div>
            <div className="font-semibold">
              Drag & drop {isVideo ? "a video" : "an image"} here
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              or click to select from your computer
            </div>
          </div>
        )}
      </div>

      {value?.trim() ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-[12px] text-slate-200 space-y-2">
          <div className="text-slate-400 text-[11px]">Uploaded URL</div>
          <div className="break-all">{value}</div>

          {isVideo ? (
            <video
              src={value}
              controls
              className="w-full max-h-[260px] rounded-xl border border-slate-700 bg-black"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="Uploaded"
              className="w-full max-h-[260px] object-cover rounded-xl border border-slate-700"
            />
          )}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2 text-[12px] text-red-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
