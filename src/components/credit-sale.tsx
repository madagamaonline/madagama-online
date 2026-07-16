"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Trash2, Loader2, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NicUpload } from "@/components/nic-upload";
import { formatLKR, round2 } from "@/lib/utils";
import { sumLines } from "@/lib/totals";
import { createCreditSale } from "@/app/(app)/credit/actions";
import { QuickCustomerModal } from "@/components/quick-customer-modal";

type ProductHit = {
  id: string;
  code: string;
  shortCode?: number; // sticker code (#N) — optional so old handed-over carts still load
  name: string;
  modelNumber?: string | null; // optional so old handed-over carts still load
  sellingPrice: number;
  taxable: boolean;
  stock: number;
};
type CartLine = { product: ProductHit; qty: number; unitPrice: number };

const CREDIT_CART_KEY = "madagama:credit-cart";

export function CreditSale({
  customers,
  employees,
  interestRatePct,
  freeMonths,
  nonTaxableEnabled = true,
}: {
  customers: { id: string; name: string; phone: string }[];
  employees: { id: string; name: string }[];
  interestRatePct: number;
  freeMonths: number;
  nonTaxableEnabled?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  const [discount, setDiscount] = useState(0);
  const [totalInput, setTotalInput] = useState("");
  const totalEditing = useRef(false);
  const [downPayment, setDownPayment] = useState(0);
  const [downPaymentMethod, setDownPaymentMethod] = useState<"CASH" | "BANK" | "CHEQUE" | "CARD">("CASH");
  const [customerId, setCustomerId] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [g, setG] = useState({ name: "", nic: "", phone: "", address: "", nicFrontKey: "", nicBackKey: "" });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [phoneClash, setPhoneClash] = useState(false);
  const [allowDuplicatePhone, setAllowDuplicatePhone] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  // Customers added via the quick-add modal during this session, kept separate
  // from the `customers` prop and merged during render — mirroring the prop into
  // state via an effect triggers cascading renders (react-hooks/set-state-in-effect).
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

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
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
        submitRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Pick up a cart carried over from "Switch to Credit (keep cart)" on the cash screen.
  useEffect(() => {
    let carried: CartLine[] | null = null;
    try {
      const raw = localStorage.getItem(CREDIT_CART_KEY);
      if (raw) {
        carried = JSON.parse(raw) as CartLine[];
        localStorage.removeItem(CREDIT_CART_KEY);
      }
    } catch {
      /* ignore */
    }
    if (!carried?.length) return;
    const items = carried;
    const t = setTimeout(() => setCart(items), 0);
    return () => clearTimeout(t);
  }, []);

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

  function addProduct(p: ProductHit) {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const c = [...prev];
        c[i] = { ...c[i], qty: c[i].qty + 1 };
        return c;
      }
      return [...prev, { product: p, qty: 1, unitPrice: p.sellingPrice }];
    });
    setQuery("");
    setHits([]);
    setOpen(false);
    setActiveIdx(0);
    searchRef.current?.focus();
  }

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

  const totals = sumLines(
    cart.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
    discount || 0,
  );
  const hasTaxable = cart.some((l) => l.product.taxable);
  const hasNonTaxable = cart.some((l) => !l.product.taxable);
  const mixed = hasTaxable && hasNonTaxable;
  const category = hasTaxable ? "TAXABLE" : "NON_TAXABLE";
  const remainingCredit = round2(Math.max(0, totals.grandTotal - downPayment));

  // Keep the field independently editable while focused so clearing it does
  // not immediately replace the draft with the calculated selling price.
  useEffect(() => {
    if (totalEditing.current) return;
    setTotalInput(cart.length > 0 ? String(totals.grandTotal) : "");
  }, [cart.length, totals.grandTotal]);

  function submit() {
    setError("");
    if (cart.length === 0) return setError("Add at least one item.");
    if (mixed) return setError("A credit sale must be all taxable or all non-taxable items. Please make two separate credit sales.");
    if (!customerId) return setError("Select a customer.");
    if (!g.name || !g.nic || !g.phone) return setError("Guarantor name, NIC and phone are required.");
    if (downPayment < 0 || downPayment > totals.grandTotal) {
      return setError("Down payment cannot exceed the total sale price.");
    }
    if (downPayment > 0 && round2(downPayment) === round2(totals.grandTotal)) {
      return setError("Use a cash sale when the customer pays the full amount.");
    }
    startTransition(async () => {
      const res = await createCreditSale({
        lines: cart.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice })),
        discount: discount || 0,
        customerId,
        soldByEmployeeId: soldBy || null,
        guarantor: g,
        notes: notes || null,
        allowDuplicatePhone,
        downPayment,
        downPaymentMethod,
      });
      if (!res.ok) {
        setError(res.error);
        setPhoneClash(!!res.duplicate);
        return;
      }
      router.push(`/credit/${res.agreementId}?new=1`);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
              <Input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Type product code or name…"
                className="h-12 pl-10 text-base"
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
                        </span>
                      </span>
                      <span className="font-medium">{formatLKR(h.sellingPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {cart.map((l) => (
                    <tr
                      key={l.product.id}
                      className={`border-b border-border last:border-0 ${
                        removing.has(l.product.id) ? "animate-row-out" : "animate-row-in"
                      }`}
                    >
                      <td className="py-2">
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
                      </td>
                      <td className="px-2">
                        <Input
                          type="number"
                          min="1"
                          value={l.qty}
                          onChange={(e) =>
                            setCart((prev) =>
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
                          value={l.unitPrice}
                          onValueChange={(c) =>
                            setCart((prev) =>
                              prev.map((x) =>
                                x.product.id === l.product.id ? { ...x, unitPrice: Math.max(0, Number(c)) } : x,
                              ),
                            )
                          }
                          className="h-9 w-28"
                        />
                      </td>
                      <td className="px-2 text-right font-medium">{formatLKR(l.qty * l.unitPrice)}</td>
                      <td className="pl-2 text-right">
                        <button
                          onClick={() => {
                            const id = l.product.id;
                            setRemoving((prev) => new Set(prev).add(id));
                            setTimeout(() => {
                              setCart((prev) => prev.filter((x) => x.product.id !== id));
                              setRemoving((prev) => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                              });
                            }, 170);
                          }}
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

        {/* Guarantor */}
        <Card>
          <CardHeader>
            <CardTitle>Guarantor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
              </div>
              <div>
                <Label>NIC number</Label>
                <Input value={g.nic} onChange={(e) => setG({ ...g, nic: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} />
              </div>
              <div>
                <Label>Address (optional)</Label>
                <Input value={g.address} onChange={(e) => setG({ ...g, address: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NicUpload name="g_front" label="Guarantor NIC — Front" onChange={(k) => setG((s) => ({ ...s, nicFrontKey: k }))} />
              <NicUpload name="g_back" label="Guarantor NIC — Back" onChange={(k) => setG((s) => ({ ...s, nicBackKey: k }))} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-[82px] lg:h-fit">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <Label>Customer</Label>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomer(true)}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  + Quick Add
                </button>
              </div>
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Select customer…</option>
                {localCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </Select>
              <Link href="/customers/new" className="mt-1 inline-block text-xs text-primary hover:underline">
                + Add detailed customer
              </Link>
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {nonTaxableEnabled && cart.length > 0 && !mixed && (
              <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
                <span className="text-muted">Bill type</span>
                <span
                  className={`inline-block h-3 w-3 rounded-full ${category === "TAXABLE" ? "bg-success" : "bg-danger"}`}
                  title={category === "TAXABLE" ? "Taxable" : "Non-taxable"}
                />
              </div>
            )}

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
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-lg font-semibold">
                <span>Total sale price</span>
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
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <span className="text-muted">Down payment</span>
                <NumberInput
                  value={downPayment || ""}
                  onValueChange={(c) => setDownPayment(Math.max(0, Number(c)))}
                  className="h-9 w-32 text-right"
                  placeholder="0.00"
                />
              </div>
              {downPayment > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">Payment method</span>
                  <Select
                    value={downPaymentMethod}
                    onChange={(e) => setDownPaymentMethod(e.target.value as typeof downPaymentMethod)}
                    className="h-9 w-40"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARD">Card</option>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <span>Remaining on credit</span>
                <span>{formatLKR(remainingCredit)}</span>
              </div>
              {downPayment > 0 && (
                <p className="text-right text-[11px] font-normal text-muted">
                  The down payment will be recorded as the first payment.
                </p>
              )}
            </div>

            <div className="rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
              No interest is posted for {freeMonths} months. At the end of month {freeMonths + 1}, a one-time
              catch-up of {interestRatePct}% × {freeMonths + 1} is charged on the remaining principal. Later
              months charge {interestRatePct}% on remaining principal.
            </div>

            {mixed && (
              <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">
                This cart mixes taxable and non-taxable items. A credit sale must be one type — please make two separate credit sales.
              </div>
            )}

            {error && <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</div>}

            {phoneClash && (
              <label className="flex items-start gap-2 rounded-lg bg-clay-soft px-3 py-2 text-xs text-clay-ink">
                <input
                  type="checkbox"
                  checked={allowDuplicatePhone}
                  onChange={(e) => setAllowDuplicatePhone(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>Continue anyway — the guarantor&apos;s phone matches the customer&apos;s.</span>
              </label>
            )}

            <Button onClick={submit} size="lg" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
              {pending ? "Saving…" : "Create Credit Sale"}
            </Button>
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
