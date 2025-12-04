"use client";

import React, { useCallback, useState } from "react";

type UploadedMedia = {
  id: string;
  type: string;
  storage_path: string;
  original_filename: string;
};

interface MediaDropzoneProps {
  organisationId: string;
  onUploaded?: (media: UploadedMedia) => void;
}

export default function MediaDropzone({
  organisationId,
  onUploaded,
}: MediaDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      const file = files[0]; // first for now, we can make multi later

      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("organisationId", organisationId);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        if (onUploaded) onUploaded(data.media);
      }

      setUploading(false);
    },
    [organisationId, onUploaded]
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300"
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() =>
          document.getElementById("media-file-input")?.click()
        }
      >
        <input
          id="media-file-input"
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*"
          onChange={onFileChange}
        />
        <p className="font-medium">
          {uploading ? "Uploading..." : "Drag & drop media here"}
        </p>
        <p className="text-sm text-gray-500">
          or click to choose a file (images, video, audio)
        </p>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
