"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickCreateCustomer } from "@/app/(app)/customers/actions";

export function QuickCustomerModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (customer: { id: string; name: string; phone: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !phone.trim()) {
      setError("Name and phone are required.");
      return;
    }
    startTransition(async () => {
      const res = await quickCreateCustomer({ name, phone, nic, confirmDuplicate });
      if (!res.ok) {
        setError(res.error);
        setDuplicate(!!res.duplicate);
        return;
      }
      onSuccess(res.customer);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-muted hover:bg-border-subtle hover:text-foreground cursor-pointer transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-base font-bold text-foreground">Quick Add Customer</h3>
        <p className="mt-0.5 text-xs text-muted">Create a customer profile without leaving checkout.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">
              {error}
            </div>
          )}
          {duplicate && (
            <label className="flex items-start gap-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
              <input
                type="checkbox"
                checked={confirmDuplicate}
                onChange={(e) => setConfirmDuplicate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>Add anyway — this phone number is already used by another customer.</span>
            </label>
          )}
          <div>
            <Label htmlFor="quick-name">Name</Label>
            <Input
              id="quick-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. K. Perera"
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="quick-phone">Phone</Label>
            <Input
              id="quick-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0771234567"
              required
            />
          </div>
          <div>
            <Label htmlFor="quick-nic">NIC number (optional)</Label>
            <Input
              id="quick-nic"
              value={nic}
              onChange={(e) => setNic(e.target.value)}
              placeholder="e.g. 199012345678"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {pending ? "Creating…" : "Create Customer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
