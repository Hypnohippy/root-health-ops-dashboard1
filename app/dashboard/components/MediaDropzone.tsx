// app/dashboard/components/MediaDropzone.tsx
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

export type UploadedMedia = {
  // ✅ added: used by content/new/page.tsx (acts as a stable “media id”)
  id: string;

  url: string;
  path: string;
  bucket: string;
  contentType: string;
  size: number;
  kind: "image" | "video" | "other";
};

type Props = {
  // accepted to prevent TS errors where it’s passed
  organisationId?: string;

  // Called when upload succeeds
  onUploaded: (media: UploadedMedia) => void;

  // Optional UI control
  label?: string;
  helpText?: string;
  maxMb?: number; // defaults to 50
  accept?: string; // defaults to images + video
};

function bytesToMb(n: number) {
  return n / (1024 * 1024);
}

function inferKind(contentType: string): UploadedMedia["kind"] {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("video/")) return "video";
  return "other";
}

export default function MediaDropzone({
  organisationId, // not used yet, but safe
  onUploaded,
  label = "Upload media",
  helpText = "Drag & drop an image or video (max 50MB).",
  maxMb = 50,
  accept = "image/*,video/*",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<UploadedMedia | null>(null);

  const maxBytes = useMemo(() => maxMb * 1024 * 1024, [maxMb]);

  const pick = () => inputRef.current?.click();

  const uploadFile = useCallback(
    async (file: File) => {
      setErr(null);

      if (!file) return;
      if (file.size > maxBytes) {
        setErr(
          `That file is ${bytesToMb(file.size).toFixed(1)}MB. Max is ${maxMb}MB.`
        );
        return;
      }

      setBusy(true);
      try {
        const fd = new FormData();
        fd.append("file", file);

        // Optional, for future org-based foldering
        if (organisationId) fd.append("organisationId", organisationId);

        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: fd,
        });

        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || `Upload failed (${res.status})`);
        }

        const path = String(json.path || "");
        const url = String(json.url || "");
        const contentType = String(json.contentType || file.type || "");
        const size = Number(json.size || file.size || 0);
        const bucket = String(json.bucket || "public-media");

        // ✅ This is what fixes your deploy:
        // treat the storage path as a stable “id”
        const media: UploadedMedia = {
          id: path || url || `upload_${Date.now()}`,
          path,
          url,
          bucket,
          contentType,
          size,
          kind: inferKind(contentType),
        };

        setLast(media);
        onUploaded(media);
      } catch (e: any) {
        setErr(e?.message || "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [maxBytes, maxMb, onUploaded, organisationId]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      await uploadFile(file);
    },
    [uploadFile]
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>

      <div
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={[
          "cursor-pointer rounded-2xl border p-4 transition",
          dragOver
            ? "border-emerald-400 bg-emerald-500/10"
            : "border-slate-700 bg-slate-950",
        ].join(" ")}
      >
        <div className="text-sm text-slate-200">
          {busy ? "Uploading…" : "Drag & drop here (or click to choose)"}
        </div>
        <div className="mt-1 text-[11px] text-slate-400">{helpText}</div>

        {last?.url ? (
          <div className="mt-3 text-[11px] text-slate-300 break-all">
            <span className="text-slate-500">Uploaded:</span> {last.url}
          </div>
        ) : null}

        {err ? <div className="mt-3 text-[11px] text-red-400">{err}</div> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          await uploadFile(file);
        }}
      />
    </div>
  );
}
