"use client";

import { useState } from "react";
import { Upload, Loader2, FileText, X } from "lucide-react";

export function NicUpload({
  name,
  label,
  defaultKey = "",
  onChange,
}: {
  name: string;
  label: string;
  defaultKey?: string;
  onChange?: (key: string) => void;
}) {
  const [key, setKeyState] = useState(defaultKey);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function setKey(k: string) {
    setKeyState(k);
    onChange?.(k);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setKey(data.key);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(key);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">{label}</label>
      <input type="hidden" name={name} value={key} />
      <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-input">
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        ) : key ? (
          <>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${key}`} alt={label} className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center text-muted">
                <FileText className="h-8 w-8" />
                <span className="text-xs">Document uploaded</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setKey("")}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-1 text-muted">
            <Upload className="h-6 w-6" />
            <span className="text-xs">Click to upload</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
