"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Trash2,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  Printer,
  CreditCard,
  History,
  Pause,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLKR, round2 } from "@/lib/utils";
import { grossMarginPct } from "@/lib/pricing";
import { sumLines } from "@/lib/totals";
import { createCashInvoice, type CreatedInvoice } from "@/app/(app)/invoices/actions";
import { QuickCustomerModal } from "@/components/quick-customer-modal";

type ProductHit = {
  id: string;
  code: string;
  shortCode?: number; // sticker code (#N) — optional so old localStorage drafts still load
  name: string;
  modelNumber?: string | null; // optional so previously saved drafts still load
  sellingPrice: number;
  costPrice: number; // weighted-average cost — shown so the cashier can judge discounts
  taxable: boolean;
  stock: number;
};
type CartLine = { product: ProductHit; qty: number; unitPrice: number };

const DRAFT_KEY = "madagama:sale-draft";
const RECENT_KEY = "madagama:recent-invoices";
const CREDIT_CART_KEY = "madagama:credit-cart";
const PARKED_KEY = "madagama:parked-sales";

type RecentInvoice = { id: string; invoiceNumber: string; grandTotal: number };
type ParkedSale = {
  id: string;
  label: string;
  cart: CartLine[];
  discount: number;
  customerId: string;
  soldBy: string;
  notes: string;
  ts: number;
};

export function NewSale({
  employees,
  customers,
  nonTaxableEnabled = true,
}: {
  employees: { id: string; name: string }[];
  customers: { id: string; name: string; phone: string }[];
  nonTaxableEnabled?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [totalInput, setTotalInput] = useState("");
  const totalEditing = useRef(false);
  const [tendered, setTendered] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreatedInvoice[] | null>(null);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);
  const [parked, setParked] = useState<ParkedSale[]>([]);
  const [resumed, setResumed] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  // Customers added via the quick-add modal during this session, merged with the
  // `customers` prop during render — mirroring the prop into state via an effect
  // triggers cascading renders (react-hooks/set-state-in-effect).
  const [addedCustomers, setAddedCustomers] = useState<typeof customers>([]);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const localCustomers = useMemo(
    () => [...addedCustomers, ...customers],
    [addedCustomers, customers],
  );

  function handleQuickCustomerSuccess(newCust: { id: string; name: string; phone: string }) {
    setAddedCustomers((prev) => [newCust, ...prev]);
    setCustomerId(newCust.id);
  }

  const completeSaleRef = useRef(completeSale);
  useEffect(() => {
    completeSaleRef.current = completeSale;
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      const isInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");

      if (e.key === "F2" || (e.key === "/" && !isInput)) {
        e.preventDefault();
        searchRef.current?.focus();
      }

      if (e.key === "F9") {
        e.preventDefault();
        completeSaleRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Restore a held draft + the recent-invoices strip on mount (client only).
  useEffect(() => {
    let draft: { cart: CartLine[]; discount: number; customerId: string; soldBy: string; notes?: string } | null = null;
    let recentList: RecentInvoice[] | null = null;
    let parkedList: ParkedSale[] | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
      const r = localStorage.getItem(RECENT_KEY);
      if (r) recentList = JSON.parse(r) as RecentInvoice[];
      const p = localStorage.getItem(PARKED_KEY);
      if (p) parkedList = JSON.parse(p) as ParkedSale[];
    } catch {
      /* ignore corrupt storage */
    }
    const t = setTimeout(() => {
      if (draft?.cart?.length) {
        setCart(draft.cart);
        setDiscount(draft.discount || 0);
        setCustomerId(draft.customerId || "");
        setSoldBy(draft.soldBy || "");
        setNotes(draft.notes || "");
        setResumed(true);
      }
      if (recentList) setRecent(recentList);
      if (parkedList) setParked(parkedList);
      hydrated.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Auto-persist the working sale so navigating away never loses the cart.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (cart.length) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ cart, discount, customerId, soldBy, notes }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [cart, discount, customerId, soldBy, notes]);

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

  const addProduct = useCallback((p: ProductHit) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { product: p, qty: 1, unitPrice: p.sellingPrice }];
    });
    setQuery("");
    setHits([]);
    setOpen(false);
    setActiveIdx(0);
    searchRef.current?.focus();
  }, []);

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === "Enter" && hits[0]) {
        e.preventDefault();
        addProduct(hits[0]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = hits[activeIdx] ?? hits[0];
      if (pick) addProduct(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setHits([]);
      setOpen(false);
    }
  }

  function updateLine(id: string, patch: Partial<Pick<CartLine, "qty" | "unitPrice">>) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    // Play the slide-out, then drop the line once the animation finishes.
    setRemoving((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setCart((prev) => prev.filter((l) => l.product.id !== id));
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 170);
  }
  function clearSale() {
    setCart([]);
    setDiscount(0);
    setTendered(0);
    setCustomerId("");
    setSoldBy("");
    setNotes("");
    setError("");
    setResumed(false);
  }

  function persistParked(list: ParkedSale[]) {
    setParked(list);
    try {
      localStorage.setItem(PARKED_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }

  function parkSale() {
    if (cart.length === 0) return;
    const cust = localCustomers.find((c) => c.id === customerId);
    const items = cart.reduce((s, l) => s + l.qty, 0);
    const entry: ParkedSale = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: cust ? cust.name : `${items} item${items === 1 ? "" : "s"}`,
      cart,
      discount,
      customerId,
      soldBy,
      notes,
      ts: Date.now(),
    };
    persistParked([entry, ...parked]);
    clearSale();
    searchRef.current?.focus();
  }

  function resumeParked(id: string) {
    const entry = parked.find((p) => p.id === id);
    if (!entry) return;
    setCart(entry.cart);
    setDiscount(entry.discount || 0);
    setCustomerId(entry.customerId || "");
    setSoldBy(entry.soldBy || "");
    setNotes(entry.notes || "");
    setTendered(0);
    setResumed(true);
    persistParked(parked.filter((p) => p.id !== id));
  }

  function deleteParked(id: string) {
    persistParked(parked.filter((p) => p.id !== id));
  }

  function switchToCredit() {
    try {
      localStorage.setItem(
        CREDIT_CART_KEY,
        JSON.stringify(cart.map((l) => ({ product: l.product, qty: l.qty, unitPrice: l.unitPrice }))),
      );
    } catch {
      /* ignore */
    }
    router.push("/credit/new");
  }

  const taxableLines = cart.filter((l) => l.product.taxable);
  const nonTaxableLines = cart.filter((l) => !l.product.taxable);
  const subTaxable = taxableLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const subNon = nonTaxableLines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  // With non-taxable off, the cart can only hold taxable items, so never split.
  const willSplit = nonTaxableEnabled && taxableLines.length > 0 && nonTaxableLines.length > 0;
  const totals = sumLines(
    cart.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
    discount || 0,
  );
  const change = tendered > 0 ? tendered - totals.grandTotal : 0;

  // Keep the agreed total editable while its keystrokes are being used to
  // calculate the discount. Once editing ends, or when the cart/discount is
  // changed elsewhere, show the calculated total again.
  useEffect(() => {
    if (totalEditing.current) return;
    setTotalInput(cart.length > 0 ? String(totals.grandTotal) : "");
  }, [cart.length, totals.grandTotal]);

  function completeSale() {
    setError("");
    if (cart.length === 0) {
      setError("Add at least one item.");
      return;
    }
    startTransition(async () => {
      const res = await createCashInvoice({
        lines: cart.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice })),
        discount: discount || 0,
        customerId: customerId || null,
        soldByEmployeeId: soldBy || null,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.invoices);
      try {
        const next = [
          ...res.invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            grandTotal: inv.grandTotal,
          })),
          ...recent,
        ].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        setRecent(next);
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setCart([]);
      setDiscount(0);
      setTendered(0);
      setCustomerId("");
      setSoldBy("");
      setNotes("");
      setResumed(false);
    });
  }

  function startNewSale() {
    setResult(null);
    searchRef.current?.focus();
  }

  if (result) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-primary-ink">
              <CheckCircle2 className="h-6 w-6" />
              <h2 className="text-lg font-semibold">Sale completed</h2>
            </div>
            {result.length > 1 && (
              <p className="text-sm text-muted">
                The cart had both taxable and non-taxable items, so it was split into two bills.
              </p>
            )}
            <div className="divide-y divide-border rounded-lg border border-border">
              {result.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono font-semibold ${nonTaxableEnabled ? (inv.taxCategory === "TAXABLE" ? "text-success" : "text-danger") : ""}`}
                        title={nonTaxableEnabled ? (inv.taxCategory === "TAXABLE" ? "Taxable" : "Non-taxable") : undefined}
                      >
                        {inv.invoiceNumber}
                      </span>
                    </div>
                    <div className="text-sm text-muted">{formatLKR(inv.grandTotal)}</div>
                  </div>
                  <Link href={`/invoices/${inv.id}?new=1`}>
                    <Button variant="outline" size="sm">
                      <Printer className="h-4 w-4" /> View / Print
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
            <Button onClick={startNewSale} size="lg" className="w-full">
              <ShoppingCart className="h-5 w-5" /> New Sale
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left: search + cart */}
      <div className="lg:col-span-2">
        <Card>
          <CardContent>
            {resumed && cart.length > 0 && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
                <span>Resumed a held sale ({cart.length} item{cart.length > 1 ? "s" : ""}).</span>
                <button onClick={clearSale} className="font-semibold underline hover:opacity-80">
                  Discard
                </button>
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => hits.length && setOpen(true)}
                onKeyDown={onSearchKeyDown}
                placeholder="Type product code or name (e.g. AGR-TOOL-0001)…"
                className="h-12 pl-10 text-base"
                autoFocus
              />
              {open && hits.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                  {hits.map((h, i) => (
                    <button
                      key={h.id}
                      onClick={() => addProduct(h)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                        i === activeIdx ? "bg-input" : "hover:bg-input"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block">
                          {h.shortCode != null && (
                            <span className="mr-1 rounded bg-primary-soft px-1.5 py-0.5 font-mono text-xs font-bold text-primary-ink">
                              #{h.shortCode}
                            </span>
                          )}
                          <span className="font-mono text-xs font-semibold text-primary">{h.code}</span>{" "}
                          <span
                            className={`font-medium ${nonTaxableEnabled ? (h.taxable ? "text-success" : "text-danger") : ""}`}
                            title={nonTaxableEnabled ? (h.taxable ? "Taxable" : "Non-taxable") : undefined}
                          >
                            {h.name}
                          </span>
                        </span>
                        <span className="block text-xs text-muted">
                          {h.modelNumber && <span className="mr-2">Model: {h.modelNumber}</span>}
                          <span>stock: {h.stock}</span>
                          {h.costPrice > 0 && <span className="ml-2">WAC: {formatLKR(h.costPrice)}</span>}
                        </span>
                      </span>
                      <span className="font-medium">{formatLKR(h.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {recent.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <History className="h-3.5 w-3.5" />
                <span className="font-semibold">Recent:</span>
                {recent.map((r) => (
                  <Link
                    key={r.id}
                    href={`/invoices/${r.id}`}
                    className="inline-flex items-center gap-1 rounded-md bg-input px-2 py-1 font-mono font-semibold text-primary-ink hover:bg-primary-soft"
                  >
                    <Printer className="h-3 w-3" /> {r.invoiceNumber}
                  </Link>
                ))}
              </div>
            )}

            {parked.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <Pause className="h-3.5 w-3.5" />
                <span className="font-semibold">Parked ({parked.length}):</span>
                {parked.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-md bg-clay-soft px-2 py-1 font-medium text-clay-ink"
                  >
                    <button onClick={() => resumeParked(p.id)} className="hover:underline" title="Resume this sale">
                      {p.label}
                    </button>
                    <button
                      onClick={() => deleteParked(p.id)}
                      className="rounded-full p-0.5 hover:bg-clay/20"
                      aria-label={`Delete parked sale ${p.label}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              {cart.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted">
                  <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Search and add products to start a sale.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-2 font-medium">Item</th>
                        <th className="px-2 font-medium">Qty</th>
                        <th className="px-2 font-medium">Unit Price</th>
                        <th className="px-2 text-right font-medium">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((l) => {
                        const hasCost = l.product.costPrice > 0;
                        const lineMargin = grossMarginPct(l.product.costPrice, l.unitPrice);
                        return (
                        <tr
                          key={l.product.id}
                          className={`border-b border-border last:border-0 ${
                            removing.has(l.product.id) ? "animate-row-out" : "animate-row-in"
                          }`}
                        >
                          <td className="py-2 pr-2">
                            <div className="font-mono text-xs font-semibold text-primary">
                              {l.product.shortCode != null && (
                                <span className="mr-1.5 font-bold text-primary-ink">#{l.product.shortCode}</span>
                              )}
                              {l.product.code}
                            </div>
                            <div
                              className={`font-medium ${nonTaxableEnabled ? (l.product.taxable ? "text-success" : "text-danger") : ""}`}
                              title={nonTaxableEnabled ? (l.product.taxable ? "Taxable" : "Non-taxable") : undefined}
                            >
                              {l.product.name}
                            </div>
                            {l.product.modelNumber && (
                              <div className="text-xs text-muted">Model: {l.product.modelNumber}</div>
                            )}
                            {hasCost && (
                              <div className="text-xs text-muted">
                                WAC {formatLKR(l.product.costPrice)} · margin{" "}
                                <span className={lineMargin < 0 ? "font-semibold text-danger" : "font-semibold text-foreground"}>
                                  {lineMargin.toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2">
                            <Input
                              type="number"
                              min="1"
                              value={l.qty}
                              onChange={(e) => updateLine(l.product.id, { qty: Math.max(1, Number(e.target.value)) })}
                              className="h-9 w-20"
                            />
                          </td>
                          <td className="px-2">
                            <NumberInput
                              value={l.unitPrice}
                              onValueChange={(c) => updateLine(l.product.id, { unitPrice: Math.max(0, Number(c)) })}
                              className="h-9 w-28"
                            />
                          </td>
                          <td className="px-2 text-right font-medium">{formatLKR(l.qty * l.unitPrice)}</td>
                          <td className="pl-2 text-right">
                            <button
                              onClick={() => removeLine(l.product.id)}
                              className="rounded-md p-1.5 text-danger hover:bg-danger-soft"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-3 flex justify-end gap-4">
                    <button onClick={parkSale} className="text-xs font-semibold text-primary hover:underline">
                      Park sale
                    </button>
                    <button onClick={clearSale} className="text-xs font-semibold text-muted hover:text-danger">
                      Clear sale
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: summary */}
      <div className="lg:sticky lg:top-[82px] lg:h-fit">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label>Customer (optional)</Label>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomer(true)}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  + Quick Add
                </button>
              </div>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {localCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Sold by (optional)</Label>
              <Select value={soldBy} onChange={(e) => setSoldBy(e.target.value)}>
                <option value="">—</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. 6-month warranty on batteries…"
                className="min-h-[60px]"
              />
              <p className="mt-1 text-[11px] text-muted">Prints on the invoice.</p>
            </div>

            <div className="space-y-1.5 border-t border-border pt-4 text-sm">
              {willSplit && (
                <>
                  <div className="flex justify-between text-muted">
                    <span>Taxable items</span>
                    <span>{formatLKR(subTaxable)}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Non-taxable items</span>
                    <span>{formatLKR(subNon)}</span>
                  </div>
                </>
              )}
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
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-lg font-semibold">
                <span>Total</span>
                <NumberInput
                  value={totalInput}
                  onFocus={() => {
                    totalEditing.current = true;
                  }}
                  onBlur={() => {
                    totalEditing.current = false;
                    setTotalInput(cart.length > 0 ? String(totals.grandTotal) : "");
                  }}
                  onValueChange={(c) => {
                    // Typing the agreed final price back-fills the discount.
                    setTotalInput(c);
                    const pay = Number(c);
                    setDiscount(c === "" || pay >= totals.subtotal ? 0 : round2(totals.subtotal - pay));
                  }}
                  className="h-10 w-32 text-right text-lg font-semibold"
                  placeholder="0.00"
                />
              </div>
              <p className="text-right text-[11px] font-normal text-muted">
                Type the agreed price in Total — the discount fills in automatically.
              </p>
            </div>

            {/* Cash tendered + change */}
            <div className="space-y-1.5 rounded-xl bg-input/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Cash received</span>
                <NumberInput
                  value={tendered || ""}
                  onValueChange={(c) => setTendered(Math.max(0, Number(c)))}
                  className="h-9 w-32 text-right"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {quickTenders(totals.grandTotal).map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setTendered(amt)}
                    className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-primary-soft"
                  >
                    {formatLKR(amt).replace(".00", "")}
                  </button>
                ))}
              </div>
              {tendered > 0 && (
                <div
                  className={`flex justify-between border-t border-border pt-2 font-semibold ${
                    change < 0 ? "text-danger" : "text-primary-ink"
                  }`}
                >
                  <span>{change < 0 ? "Short by" : "Change due"}</span>
                  <span>{formatLKR(Math.abs(change))}</span>
                </div>
              )}
            </div>

            {willSplit && (
              <div className="rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
                This sale has taxable and non-taxable items — it will be saved as two separate bills (TX + NT).
              </div>
            )}

            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}

            <Button onClick={completeSale} size="lg" className="w-full" disabled={pending || cart.length === 0}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShoppingCart className="h-5 w-5" />}
              {pending ? "Saving…" : "Complete Cash Sale"}
            </Button>
            <button
              onClick={switchToCredit}
              disabled={cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-input-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-input disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" /> Switch to Credit (keep cart)
            </button>
          </CardContent>
        </Card>
      </div>
      {showQuickCustomer && (
        <QuickCustomerModal
          onClose={() => setShowQuickCustomer(false)}
          onSuccess={handleQuickCustomerSuccess}
        />
      )}
    </div>
  );
}

// Suggest the exact total plus the next round notes the cashier is likely handed.
function quickTenders(total: number): number[] {
  if (total <= 0) return [];
  const out = new Set<number>();
  out.add(Math.ceil(total));
  for (const note of [100, 500, 1000, 5000]) {
    const up = Math.ceil(total / note) * note;
    if (up > total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 4);
}
