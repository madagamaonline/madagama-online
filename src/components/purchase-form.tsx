"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trash2, Loader2, PackagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR, round2 } from "@/lib/utils";
import { createPurchase } from "@/app/(app)/purchases/actions";
import { QuickProductModal, type QuickProductCategory } from "@/components/quick-product-modal";

type ProductHit = { id: string; code: string; name: string; costPrice: number; stock: number };
type Line = { product: ProductHit; qty: number; costPrice: number };

export function PurchaseForm({
  suppliers,
  categories,
  nonTaxableEnabled = true,
  defaultSupplierId = "",
}: {
  suppliers: { id: string; name: string }[];
  categories: QuickProductCategory[];
  nonTaxableEnabled?: boolean;
  defaultSupplierId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"CASH" | "CREDIT">("CASH");
  const [creditDueDate, setCreditDueDate] = useState("");
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const costRefs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!q) {
        setHits([]);
        setOpen(false);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (cancelled) return;
        setHits(data.results ?? []);
        setOpen(true);
      } catch {
        if (cancelled) return;
        setHits([]);
        setOpen(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, q ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  function addProduct(p: ProductHit, focusCost = false) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const c = [...prev];
        c[i] = { ...c[i], qty: c[i].qty + 1 };
        return c;
      }
      return [...prev, { product: p, qty: 1, costPrice: p.costPrice }];
    });
    setQuery("");
    setHits([]);
    setOpen(false);
    setTimeout(() => {
      if (focusCost) costRefs.current.get(p.id)?.focus();
      else searchRef.current?.focus();
    }, 0);
  }

  const total = round2(lines.reduce((s, l) => s + l.qty * l.costPrice, 0));

  function submit() {
    setError("");
    if (!supplierId) return setError("Select a supplier.");
    if (lines.length === 0) return setError("Add at least one item.");
    if (type === "CREDIT" && !creditDueDate) return setError("Choose a credit due date.");
    startTransition(async () => {
      const res = await createPurchase({
        supplierId,
        supplierInvoiceNo: supplierInvoiceNo || null,
        date,
        type,
        creditDueDate: type === "CREDIT" ? creditDueDate : null,
        amountPaid: type === "CREDIT" ? amountPaid || 0 : total,
        notes: notes || null,
        lines: lines.map((l) => ({ productId: l.product.id, qty: l.qty, costPrice: l.costPrice })),
      });
      if (!res.ok) return setError(res.error);
      router.push(`/purchases/${res.id}`);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Items received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-6 h-5 w-5 -translate-y-1/2 text-muted" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && hits[0]) {
                      e.preventDefault();
                      addProduct(hits[0]);
                    }
                  }}
                  placeholder="Search product code or name to add stock…"
                  className="h-12 pl-10 pr-10 text-base"
                />
                {searching && (
                  <Loader2 className="pointer-events-none absolute right-3 top-6 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
                )}
                {open && !searching && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                  {hits.length > 0 ? (
                    hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => addProduct(h)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-input"
                      >
                        <span>
                          <span className="font-mono text-xs font-semibold text-primary">{h.code}</span>{" "}
                          <span className="font-medium">{h.name}</span>
                          <span className="ml-2 text-xs text-muted">stock: {h.stock}</span>
                        </span>
                        <span className="text-muted">cost {formatLKR(h.costPrice)}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3">
                      <p className="text-sm font-medium text-foreground">No products found</p>
                      <p className="mt-0.5 text-xs text-muted">Create “{query.trim()}” without leaving this purchase.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => {
                          setOpen(false);
                          setQuickProductOpen(true);
                        }}
                      >
                        <PackagePlus className="h-4 w-4" />
                        Create “{query.trim()}”
                      </Button>
                    </div>
                  )}
                </div>
              )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setOpen(false);
                  setQuickProductOpen(true);
                }}
                className="shrink-0"
              >
                <PackagePlus className="h-4 w-4" />
                Quick Add Product
              </Button>
            </div>

            {lines.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 font-medium">Item</th>
                    <th className="px-2 font-medium">Qty</th>
                    <th className="px-2 font-medium">Unit Cost</th>
                    <th className="px-2 text-right font-medium">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.product.id} className="border-b border-border last:border-0">
                      <td className="py-2">
                        <div className="font-mono text-xs font-semibold text-primary">{l.product.code}</div>
                        <div className="font-medium">{l.product.name}</div>
                      </td>
                      <td className="px-2">
                        <Input
                          type="number"
                          min="1"
                          value={l.qty}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product.id === l.product.id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x,
                              ),
                            )
                          }
                          className="h-9 w-16"
                        />
                      </td>
                      <td className="px-2">
                        <NumberInput
                          ref={(node) => {
                            if (node) costRefs.current.set(l.product.id, node);
                            else costRefs.current.delete(l.product.id);
                          }}
                          value={l.costPrice}
                          onValueChange={(c) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.product.id === l.product.id ? { ...x, costPrice: Math.max(0, Number(c)) } : x,
                              ),
                            )
                          }
                          className="h-9 w-28"
                        />
                      </td>
                      <td className="px-2 text-right font-medium">{formatLKR(l.qty * l.costPrice)}</td>
                      <td className="pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                          className="rounded-md p-1.5 text-danger hover:bg-danger-soft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <Card>
          <CardContent className="space-y-4">
            <div>
              <Label>Supplier</Label>
              <SearchSelect
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Select supplier…"
                searchPlaceholder="Search suppliers…"
                emptyText="No suppliers match."
              />
              <Link href="/suppliers/new" className="mt-1 inline-block text-xs text-primary hover:underline">
                + Add new supplier
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Supplier inv #</Label>
                <Input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Payment</Label>
              <Select value={type} onChange={(e) => setType(e.target.value as "CASH" | "CREDIT")}>
                <option value="CASH">Cash (paid in full)</option>
                <option value="CREDIT">Credit</option>
              </Select>
            </div>
            {type === "CREDIT" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={creditDueDate} onChange={(e) => setCreditDueDate(e.target.value)} />
                </div>
                <div>
                  <Label>Paid now</Label>
                  <NumberInput
                    value={amountPaid || ""}
                    onValueChange={(c) => setAmountPaid(Math.max(0, Number(c)))}
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-between border-t border-border pt-3 text-lg font-semibold">
              <span>Total</span>
              <span>{formatLKR(total)}</span>
            </div>

            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}

            <Button onClick={submit} size="lg" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackagePlus className="h-5 w-5" />}
              {pending ? "Saving…" : "Save Purchase"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {quickProductOpen && (
        <QuickProductModal
          initialName={query.trim()}
          categories={categories}
          supplierId={supplierId}
          supplierName={suppliers.find((supplier) => supplier.id === supplierId)?.name}
          nonTaxableEnabled={nonTaxableEnabled}
          onClose={() => {
            setQuickProductOpen(false);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
          onSuccess={(product) => {
            setQuickProductOpen(false);
            addProduct(product, true);
          }}
        />
      )}
    </div>
  );
}
