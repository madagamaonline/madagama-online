"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { voidInvoice } from "@/app/(app)/invoices/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function VoidInvoiceButton({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const closeDialog = useCallback(() => {
    if (pendingRef.current) return;
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => reasonRef.current?.focus());
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDialog();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeDialog, open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await voidInvoice({ invoiceId, reason });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
      router.refresh();
    });
  }

  return (
    <>
      <Button ref={triggerRef} variant="outline" onClick={() => setOpen(true)} className="text-danger hover:bg-danger-soft">
        <Ban className="h-4 w-4" /> Void invoice
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-invoice-title"
            aria-describedby="void-invoice-description"
            className="relative w-full max-w-lg rounded-2xl border border-danger/25 bg-surface p-5 shadow-xl sm:p-6"
          >
            <button type="button" onClick={closeDialog} disabled={pending} aria-label="Close void invoice dialog" className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-border-subtle hover:text-foreground disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft text-danger"><AlertTriangle className="h-5 w-5" /></div>
            <h2 id="void-invoice-title" className="mt-4 pr-8 text-lg font-bold">Void invoice {invoiceNumber}</h2>
            <p id="void-invoice-description" className="mt-1 text-sm leading-6 text-muted">
              Stock will be restored and this invoice will remain in audit history. This action cannot be undone.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-4">
              {error && <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}
              <div>
                <Label htmlFor="void-reason">Reason for voiding</Label>
                <Textarea ref={reasonRef} id="void-reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={3} maxLength={500} placeholder="Describe why this invoice was created accidentally…" className="min-h-28" />
                <p className="mt-1 text-xs text-muted">This reason becomes part of the permanent audit record.</p>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={closeDialog} disabled={pending}>Cancel</Button>
                <Button type="submit" variant="danger" disabled={pending || reason.trim().length < 3}>
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                  {pending ? "Voiding…" : "Void Invoice"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
