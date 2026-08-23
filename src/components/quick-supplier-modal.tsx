"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { quickCreateSupplier } from "@/app/(app)/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function QuickSupplierModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (supplier: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError("");
    startTransition(async () => {
      const result = await quickCreateSupplier({ name, contactPerson, phone, email, address });
      if (!result.ok) return setError(result.error);
      onSuccess(result.supplier);
      onClose();
    });
  }

  return (
    <div className="motion-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-xs">
      <section role="dialog" aria-modal="true" aria-labelledby="quick-supplier-title" className="motion-panel-in relative max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <button type="button" onClick={onClose} disabled={pending} className="absolute right-4 top-4 rounded-full p-1 text-muted hover:bg-border-subtle hover:text-foreground disabled:opacity-50" aria-label="Close quick add supplier">
          <X className="h-5 w-5" />
        </button>
        <h2 id="quick-supplier-title" className="text-base font-bold">Quick Add Supplier</h2>
        <p className="mt-0.5 text-xs text-muted">Create and select a supplier without leaving this purchase.</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">{error}</div>}
          <div><Label htmlFor="quick-supplier-name">Supplier name</Label><Input id="quick-supplier-name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label htmlFor="quick-supplier-contact">Contact person</Label><Input id="quick-supplier-contact" value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} /></div>
            <div><Label htmlFor="quick-supplier-phone">Phone</Label><Input id="quick-supplier-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
            <div className="sm:col-span-2"><Label htmlFor="quick-supplier-email">Email</Label><Input id="quick-supplier-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          </div>
          <div><Label htmlFor="quick-supplier-address">Address</Label><Textarea id="quick-supplier-address" value={address} onChange={(event) => setAddress(event.target.value)} /></div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{pending ? "Creating…" : "Create Supplier"}</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
