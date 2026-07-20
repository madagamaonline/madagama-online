"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, PenLine, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignaturePad({
  name,
  label = "Customer signature",
  required = true,
  disabled = false,
  className,
  onStatusChange,
}: {
  name: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onStatusChange?: (status: "empty" | "uploading" | "secured" | "error") => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [value, setValue] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const submit = canvasRef.current?.closest("form")?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!submit) return;
    submit.disabled = uploading || !value;
    submit.setAttribute("aria-disabled", String(uploading || !value));
  }, [uploading, value]);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const previous = snapshot;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#1e293b";
      if (previous) {
        const image = new Image();
        image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
        image.src = previous;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [snapshot]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
    drawingRef.current = true;
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const p = point(event);
    const ctx = event.currentTarget.getContext("2d");
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    setHasInk(true);
  }

  async function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      setSnapshot(dataUrl);
      setValue("");
      setUploading(true); setError(""); onStatusChange?.("uploading");
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const data = new FormData();
        data.append("file", new File([blob], "customer-signature.png", { type: "image/png" }));
        data.append("folder", "vehicle-signatures");
        const response = await fetch("/api/upload", { method: "POST", body: data });
        const body = await response.json();
        if (response.ok) { setValue(body.key); onStatusChange?.("secured"); }
        else { setError(body.error ?? "Could not secure signature."); onStatusChange?.("error"); }
      } finally {
        setUploading(false);
      }
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setValue("");
    setSnapshot("");
    setHasInk(false);
    setError("");
    onStatusChange?.("empty");
  }

  async function uploadFallback(file: File) {
    setUploading(true); setError(""); onStatusChange?.("uploading");
    try {
      const data = new FormData(); data.append("file", file); data.append("folder", "vehicle-signatures");
      const response = await fetch("/api/upload", { method: "POST", body: data }); const body = await response.json();
      if (response.ok) { setValue(body.key); setHasInk(true); onStatusChange?.("secured"); }
      else { setError(body.error ?? "Could not secure signature."); onStatusChange?.("error"); }
    } catch { setError("Could not secure signature."); onStatusChange?.("error"); }
    finally { setUploading(false); }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-foreground" htmlFor={`${name}-canvas`}>
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk || disabled}>
          <RotateCcw className="h-3.5 w-3.5" /> Clear
        </Button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-input-border bg-white focus-within:ring-2 focus-within:ring-primary/20">
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-400">
            <PenLine className="h-4 w-4" /> Sign inside this box
          </div>
        )}
        <canvas
          ref={canvasRef}
          id={`${name}-canvas`}
          className="h-40 w-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={finish}
          aria-label={label}
        />
        <div className="pointer-events-none absolute bottom-8 left-8 right-8 border-b border-slate-300" />
      </div>
      <input type="hidden" name={name === "signatureData" ? "signatureKey" : name} value={value} required={required} />
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted" aria-live="polite">{uploading ? "Securing signature… please wait before confirming." : value ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Signature secured and ready.</span> : error ? <span className="text-danger-ink">{error}</span> : "Use a finger, stylus, or mouse."}</p><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold hover:bg-input"><Upload className="h-3.5 w-3.5" />Upload signature image<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFallback(file); }} /></label></div>
    </div>
  );
}
