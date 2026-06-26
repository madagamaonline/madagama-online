"use client";

import { useState } from "react";
import { Camera, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

type Status = "idle" | "uploading" | "done" | "error";

export function ScanUploadClient({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>(token ? "idle" : "error");
  const [error, setError] = useState(token ? "" : "This link is invalid. Please scan the QR code again.");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/scan-upload?t=${encodeURIComponent(token)}`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-10 font-sans text-foreground">
      <div className="text-center">
        <h1 className="text-xl font-bold">Madagama — Upload ID photo</h1>
        <p className="mt-1 text-sm text-muted">
          Take a clear photo of the ID card and it will appear on the computer.
        </p>
      </div>

      {status === "done" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
          <CheckCircle2 className="h-12 w-12 text-primary-ink" />
          <p className="text-base font-semibold">Photo sent!</p>
          <p className="text-sm text-muted">
            It should now show on the computer. You can take another photo, or close this page.
          </p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-input px-4 py-2 text-sm font-medium">
            <Camera className="h-4 w-4" />
            Take another photo
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          </label>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
          <AlertTriangle className="h-12 w-12 text-danger" />
          <p className="text-sm text-danger-ink">{error}</p>
          {token && (
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">
              <Camera className="h-5 w-5" />
              Try again
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            </label>
          )}
        </div>
      ) : (
        <label
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-surface px-6 py-16 text-center shadow-xs ${
            status === "uploading" ? "pointer-events-none opacity-70" : ""
          }`}
        >
          {status === "uploading" ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary-ink" />
              <span className="text-sm font-medium text-muted">Sending photo…</span>
            </>
          ) : (
            <>
              <Camera className="h-14 w-14 text-primary-ink" />
              <span className="text-base font-semibold">Tap to open the camera</span>
              <span className="text-xs text-muted">Front of the card first, then the back if needed.</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFile}
            disabled={status === "uploading"}
          />
        </label>
      )}

      <p className="text-center text-[11px] text-faint">
        This link works for 10 minutes and only lets you send a photo — no other information is shown here.
      </p>
    </main>
  );
}
