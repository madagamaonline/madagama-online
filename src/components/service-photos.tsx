"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, FileText, X, Smartphone, RefreshCw } from "lucide-react";

/**
 * Multi-photo uploader for a service job. Keeps a list of storage keys and
 * serializes them into a single hidden input (`name`, comma-separated) that the
 * server action splits back into `photoKeys`. Reuses the existing
 * /api/upload + scan-ticket ("scan with phone") endpoints — no backend changes.
 */
export function ServicePhotos({
  name,
  defaultKeys = [],
}: {
  name: string;
  defaultKeys?: string[];
}) {
  const [keys, setKeys] = useState<string[]>(defaultKeys);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // "Scan with phone" handoff state.
  const [scanOpen, setScanOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanExpired, setScanExpired] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => stopPolling, []);

  function addKey(k: string) {
    setKeys((prev) => (prev.includes(k) ? prev : [...prev, k]));
  }
  function removeKey(k: string) {
    setKeys((prev) => prev.filter((x) => x !== k));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "service");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      addKey(data.key);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function startScan() {
    setScanError("");
    setScanExpired(false);
    setQrDataUrl("");
    setScanOpen(true);
    try {
      const res = await fetch("/api/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "service" }),
      });
      if (!res.ok) {
        setScanError("Could not start phone upload. Please try again.");
        return;
      }
      const { token } = await res.json();
      const url = `${window.location.origin}/scan-upload?t=${encodeURIComponent(token)}`;
      const QRCode = (await import("qrcode")).default;
      setQrDataUrl(await QRCode.toDataURL(url, { width: 240, margin: 1 }));

      const startedAt = Date.now();
      stopPolling();
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > 10 * 60 * 1000) {
          stopPolling();
          setScanExpired(true);
          return;
        }
        try {
          const s = await fetch(`/api/scan-upload?t=${encodeURIComponent(token)}`);
          if (s.status === 401) {
            stopPolling();
            setScanExpired(true);
            return;
          }
          const data = await s.json();
          if (data.ready && data.key) {
            stopPolling();
            addKey(data.key);
            setScanOpen(false);
          }
        } catch {
          // transient network hiccup — keep polling
        }
      }, 2000);
    } catch {
      setScanError("Could not start phone upload. Please try again.");
    }
  }

  function closeScan() {
    stopPolling();
    setScanOpen(false);
  }

  const isImage = (k: string) => /\.(jpe?g|png|webp|gif)$/i.test(k);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        Photos <span className="font-normal text-muted">(optional — item, serial, condition)</span>
      </label>
      <input type="hidden" name={name} value={keys.join(",")} />

      <div className="flex flex-wrap gap-3">
        {keys.map((k) => (
          <div
            key={k}
            className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-lg border border-border bg-input"
          >
            {isImage(k) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${k}`} alt="Service photo" className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-muted">
                <FileText className="h-7 w-7" />
                <span className="text-[10px]">Document</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => removeKey(k)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <div className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-input text-muted">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <label className="flex cursor-pointer flex-col items-center gap-1">
                <Upload className="h-5 w-5" />
                <span className="text-[11px]">Add photo</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
              <button
                type="button"
                onClick={startScan}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-input"
              >
                <Smartphone className="h-3 w-3" /> Phone
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}

      {scanOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xs rounded-2xl border border-border bg-surface p-5 text-center shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Scan with your phone</h3>
              <button
                type="button"
                onClick={closeScan}
                aria-label="Close"
                className="rounded-md p-1 text-muted hover:bg-input"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {scanError ? (
              <p className="py-8 text-sm text-danger">{scanError}</p>
            ) : scanExpired ? (
              <div className="py-6">
                <p className="mb-3 text-sm text-muted">The QR code expired. Please generate a new one.</p>
                <button
                  type="button"
                  onClick={startScan}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
                >
                  <RefreshCw className="h-4 w-4" /> New QR code
                </button>
              </div>
            ) : qrDataUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code" className="mx-auto h-48 w-48 rounded-lg" />
                <p className="mt-3 text-xs text-muted">
                  Open the phone camera and point it at this code. The photo you take will appear here
                  automatically.
                </p>
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for the photo…
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
                <Loader2 className="h-5 w-5 animate-spin" /> Preparing…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
