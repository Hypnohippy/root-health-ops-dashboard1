// app/dashboard/components/MediaDropzone.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabaseBrowser";

export type UploadedMedia = {
  url: string;
  path?: string;
  bucket?: string;
  contentType?: string;
  size?: number;
};

type Props = {
  organisationId?: string;
  label?: string;
  helpText?: string;
  accept?: string; // e.g. "image/*" or "video/*" or "image/*,video/*"
  maxMb?: number; // default 50
  disabled?: boolean; // ✅ NEW
  onUploaded: (media: UploadedMedia) => void;
};

type InitResponse = {
  success: boolean;
  bucket?: string;
  path?: string;
  token?: string;
  publicUrl?: string;
  contentType?: string;
  size?: number;
  error?: string;
};

export default function MediaDropzone({
  organisationId,
  label = "Upload",
  helpText = "Drag & drop a file here",
  accept = "*/*",
  maxMb = 50,
  disabled = false,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const maxBytes = useMemo(() => maxMb * 1024 * 1024, [maxMb]);

  function openPicker() {
    if (disabled || busy) return;
    inputRef.current?.click();
  }

  function prettySize(bytes: number) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)}MB`;
  }

  async function uploadFile(file: File) {
    setErr(null);
    setDoneMsg(null);
    setBusy(true);

    try {
      if (!file) throw new Error("No file selected.");

      if (file.size > maxBytes) {
        throw new Error(`File too large. Max is ${maxMb}MB.`);
      }

      // 1) Ask server for signed upload token (tiny JSON -> avoids 413)
      const initRes = await fetch("/api/media/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          organisationId: organisationId || null,
        }),
      });

      const initJson: InitResponse = await initRes.json().catch(() => null as any);

      if (!initRes.ok || !initJson?.success) {
        throw new Error(initJson?.error || `Upload init failed (${initRes.status}).`);
      }

      const bucket = String(initJson.bucket || "");
      const path = String(initJson.path || "");
      const token = String(initJson.token || "");
      const publicUrl = String(initJson.publicUrl || "");
      const ct = String(initJson.contentType || file.type || "application/octet-stream");

      if (!bucket || !path || !token || !publicUrl) {
        throw new Error("Upload init response missing bucket/path/token/publicUrl.");
      }

      // 2) Upload directly to Supabase Storage (bypasses Vercel request size limits)
      const { error: upErr } = await supabaseBrowser.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file, {
          contentType: ct,
        });

      if (upErr) {
        throw new Error(`Supabase upload failed: ${upErr.message}`);
      }

      // 3) Done
      onUploaded({
        url: publicUrl,
        bucket,
        path,
        contentType: ct,
        size: file.size,
      });

      setDoneMsg(`Uploaded: ${file.name} (${prettySize(file.size)})`);
    } catch (e: any) {
      setErr(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
      setIsDragging(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busy) return;

    const file = e.dataTransfer?.files?.[0];
    if (file) void uploadFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || busy) return;
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled || busy) return;
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      {label ? <div className="text-xs font-medium text-slate-300">{label}</div> : null}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        className={[
          "rounded-2xl border px-4 py-4 text-sm transition",
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
          isDragging ? "border-emerald-500/70 bg-emerald-500/10" : "border-slate-700 bg-slate-950",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="text-slate-200">
            {disabled ? "Upload disabled" : busy ? "Uploading…" : helpText}
            <div className="mt-1 text-[11px] text-slate-500">
              Max {maxMb}MB • Accept: {accept}
            </div>
          </div>

          <div className="text-[11px] rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200">
            {busy ? "Working…" : "Choose file"}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onFilePicked}
          disabled={disabled || busy}
        />
      </div>

      {err ? <div className="text-[11px] text-red-400 whitespace-pre-wrap">{err}</div> : null}
      {doneMsg ? <div className="text-[11px] text-emerald-300 whitespace-pre-wrap">{doneMsg}</div> : null}
    </div>
  );
}
