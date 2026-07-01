"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, Plus, Loader2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR } from "@/lib/utils";
import { sumLines } from "@/lib/totals";
import type { QuotationInput, QuotationResult } from "@/app/(app)/quotations/actions";

type ProductHit = {
  id: string;
  code: string;
  name: string;
  sellingPrice: number;
  stock: number;
};

export type QuoLine = {
  key: string;
  productId: string | null;
  model: string;
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type QuotationInitial = {
  customerId: string;
  customerName: string;
  address: string;
  phone: string;
  preparedByUserId: string;
  discount: number;
  validUntil: string; // yyyy-mm-dd
  notes: string;
  lines: QuoLine[];
};

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankLine(): QuoLine {
  return { key: newKey(), productId: null, model: "", name: "", description: "", qty: 1, unitPrice: 0 };
}

const emptyInitial: QuotationInitial = {
  customerId: "",
  customerName: "",
  address: "",
  phone: "",
  preparedByUserId: "",
  discount: 0,
  validUntil: "",
  notes: "",
  lines: [],
};

export function QuotationForm({
  customers,
  cashiers,
  onSubmit,
  initial = emptyInitial,
  submitLabel = "Save quotation",
}: {
  customers: { id: string; name: string; phone: string; address: string | null }[];
  cashiers: { id: string; name: string }[];
  onSubmit: (input: QuotationInput) => Promise<QuotationResult>;
  initial?: QuotationInitial;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<QuoLine[]>(initial.lines.length ? initial.lines : [blankLine()]);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [preparedBy, setPreparedBy] = useState(initial.preparedByUserId);
  const [discount, setDiscount] = useState(initial.discount);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Catalog search for adding lines.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (!q) {
        setHits([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.results ?? []);
        setActiveIdx(0);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [query]);

  function addFromProduct(p: ProductHit) {
    setLines((prev) => [
      ...prev.filter((l) => l.name.trim() || l.model.trim() || l.description.trim()),
      {
        key: newKey(),
        productId: p.id,
        model: p.code,
        name: p.name,
        description: "",
        qty: 1,
        unitPrice: p.sellingPrice,
      },
    ]);
    setQuery("");
    setHits([]);
    setOpen(false);
    setActiveIdx(0);
    searchRef.current?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = hits[activeIdx] ?? hits[0];
      if (pick) addFromProduct(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setHits([]);
      setOpen(false);
    }
  }

  function updateLine(key: string, patch: Partial<QuoLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      // Prefill the printed header from the account, but keep it editable.
      setCustomerName(c.name);
      setPhone(c.phone);
      setAddress(c.address ?? "");
    }
  }

  const totals = sumLines(
    lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
    discount || 0,
  );

  function submit() {
    setError("");
    const filled = lines.filter((l) => l.name.trim());
    if (filled.length === 0) {
      setError("Add at least one line with an item name.");
      return;
    }
    startTransition(async () => {
      const res = await onSubmit({
        customerId: customerId || null,
        customerName: customerName || null,
        address: address || null,
        phone: phone || null,
        preparedByUserId: preparedBy || null,
        discount: discount || 0,
        validUntil: validUntil || null,
        notes: notes || null,
        lines: filled.map((l) => ({
          productId: l.productId,
          model: l.model || null,
          name: l.name,
          description: l.description || null,
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/quotations/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left: items */}
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardContent>
            <Label>Add items</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => hits.length && setOpen(true)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search catalog to add a line (code or name)…"
                className="h-11 pl-10"
              />
              {open && hits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                  {hits.map((h, i) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => addFromProduct(h)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                        i === activeIdx ? "bg-input" : "hover:bg-input"
                      }`}
                    >
                      <span>
                        <span className="font-mono text-xs font-semibold text-primary">{h.code}</span>{" "}
                        <span className="font-medium">{h.name}</span>
                        <span className="ml-2 text-xs text-muted">stock: {h.stock}</span>
                      </span>
                      <span className="font-medium">{formatLKR(h.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Or add a free-text line for custom / spec&rsquo;d items (e.g. solar pumps).
            </p>

            <div className="mt-4 space-y-3">
              {lines.map((l, idx) => (
                <div key={l.key} className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-faint">Line {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      disabled={lines.length === 1}
                      className="rounded-md p-1 text-danger hover:bg-danger-soft disabled:opacity-40"
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                    <div className="col-span-1 sm:col-span-2">
                      <Label>Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={l.qty}
                        onChange={(e) => updateLine(l.key, { qty: Math.max(1, Number(e.target.value)) })}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-4">
                      <Label>Model</Label>
                      <Input
                        value={l.model}
                        onChange={(e) => updateLine(l.key, { model: e.target.value })}
                        placeholder="e.g. 2x2-2HP"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-6">
                      <Label>Price</Label>
                      <NumberInput
                        value={l.unitPrice || ""}
                        onValueChange={(c) => updateLine(l.key, { unitPrice: Math.max(0, Number(c)) })}
                        placeholder="0.00"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-12">
                      <Label>Item name</Label>
                      <Input
                        value={l.name}
                        onChange={(e) => updateLine(l.key, { name: e.target.value })}
                        placeholder="e.g. Solar Water Pump (Domestic)"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-12">
                      <Label>Product details (optional)</Label>
                      <Textarea
                        value={l.description}
                        onChange={(e) => updateLine(l.key, { description: e.target.value })}
                        placeholder={"2 year warranty\n595 Panel × 4\nHead 28M · 35000 L/Hr"}
                        className="min-h-[60px]"
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-right text-sm text-muted">
                    Line total: <span className="font-semibold text-foreground">{formatLKR(l.qty * l.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, blankLine()])}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <Plus className="h-4 w-4" /> Add blank line
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Right: customer + summary */}
      <div className="space-y-4 lg:sticky lg:top-[82px] lg:h-fit">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <Label>Customer account (optional)</Label>
              <Select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">— No account (type below) —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="customerName">Customer name</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name shown on the quotation"
              />
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="min-h-[54px]"
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <Label>Prepared by (cashier)</Label>
              <Select value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)}>
                <option value="">—</option>
                {cashiers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="validUntil">Valid until (optional)</Label>
              <Input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span>{formatLKR(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Discount</span>
                <NumberInput
                  value={discount || ""}
                  onValueChange={(c) => setDiscount(Math.max(0, Number(c)))}
                  className="h-9 w-28 text-right"
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
                <span>Total</span>
                <span>{formatLKR(totals.grandTotal)}</span>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Terms, delivery, extra remarks…"
                className="min-h-[54px]"
              />
            </div>

            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}

            <Button onClick={submit} size="lg" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
              {pending ? "Saving…" : submitLabel}
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => router.back()}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
