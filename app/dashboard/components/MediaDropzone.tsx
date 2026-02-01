// app/dashboard/components/MediaDropzone.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../../lib/supabaseBrowser";

export type UploadedMediaKind = "image" | "video" | "file";

export type UploadedMedia = {
  kind: UploadedMediaKind; // ✅ NEW (fixes stories page m.kind usage)
  url: string;
  path?: string;
  bucket?: string;
  contentType?: string;
  size?: number;
  name?: string;
};

type Props = {
  organisationId?: string;
  label?: string;
  helpText?: string;
  accept?: string; // e.g. "image/*" or "video/*"
  maxMb?: number; // default 50
  onUploaded: (media: UploadedMedia) => void;
};

type InitResponse = {
  success: boolean;
  bucket?: string;
  path?: string;
  token?: string;
  signedUrl?: string;
  publicUrl?: string;
  contentType?: string;
  size?: number;
  error?: string;
};

function classifyKind(contentType?: string, filename?: string): UploadedMediaKind {
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("video/")) return "video";
  if (ct.startsWith("image/")) return "image";

  const name = String(filename || "").toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return "image";

  return "file";
}

export default function MediaDropzone({
  organisationId,
  label = "Upload",
  helpText = "Drag & drop a file here",
  accept = "*/*",
  maxMb = 50,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const maxBytes = useMemo(() => maxMb * 1024 * 1024, [maxMb]);

  function openPicker() {
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

      // ✅ Stop the browser doing anything “clever” with drops
      // (we already preventDefault in onDrop, but keep logic tight)
      const kind = classifyKind(file.type, file.name);

      // 1) Ask server for signed upload token (tiny JSON, no 413)
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

      if (!bucket || !path || !token || !publicUrl) {
        throw new Error("Upload init response missing bucket/path/token/publicUrl.");
      }

      // 2) Upload directly to Supabase Storage (bypasses Vercel limits)
      const { error: upErr } = await supabaseBrowser.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || initJson.contentType || "application/octet-stream",
        });

      if (upErr) {
        throw new Error(`Supabase upload failed: ${upErr.message}`);
      }

      // 3) Done
      onUploaded({
        kind, // ✅ NEW
        url: publicUrl,
        bucket,
        path,
        contentType: file.type || initJson.contentType,
        size: file.size,
        name: file.name,
      });

      setDoneMsg(`Uploaded: ${file.name} (${prettySize(file.size)})`);
    } catch (e: any) {
      setErr(e?.message || "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) void uploadFile(file);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Ensure drop is treated as copy (prevents browser opening the file)
    try {
      e.dataTransfer.dropEffect = "copy";
    } catch {}
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
    // allow selecting the same file again
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      {label ? <div className="text-xs font-medium text-slate-300">{label}</div> : null}

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={[
          "rounded-2xl border px-4 py-4 text-sm transition cursor-pointer",
          isDragging ? "border-emerald-500/70 bg-emerald-500/10" : "border-slate-700 bg-slate-950",
        ].join(" ")}
        onClick={openPicker}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="text-slate-200">
            {busy ? "Uploading…" : helpText}
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
        />
      </div>

      {err ? <div className="text-[11px] text-red-400 whitespace-pre-wrap">{err}</div> : null}

      {doneMsg ? <div className="text-[11px] text-emerald-300 whitespace-pre-wrap">{doneMsg}</div> : null}
    </div>
  );
}
