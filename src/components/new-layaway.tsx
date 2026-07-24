"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2, PackageCheck, Search, ShieldCheck, Trash2 } from "lucide-react";
import { CustomerSearchPicker, type SaleCustomer } from "@/components/customer-search-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLayaway } from "@/app/(app)/layaways/actions";
import { formatLKR, round2 } from "@/lib/utils";
import { LayawayJourney } from "@/components/layaway-journey";

type ProductHit = { id: string; code: string; name: string; sellingPrice: number; costPrice: number; stock: number; reservedStock?: number; physicalStock?: number };
type Line = { product: ProductHit; qty: number; unitPrice: number };

export function NewLayaway({ customers }: { customers: SaleCustomer[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customerId, setCustomerId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState(0);
  const [initialPayment, setInitialPayment] = useState(0);
  const [method, setMethod] = useState<"CASH"|"BANK"|"CHEQUE"|"CARD">("CASH");
  const [reference, setReference] = useState("");
  const [pickup, setPickup] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (!q) return setHits([]);
      try { const response = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`); setHits((await response.json()).results ?? []); } catch { setHits([]); }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);
  const subtotal = round2(lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0));
  const total = Math.max(0, round2(subtotal - discount));

  function add(product: ProductHit) {
    setLines((current) => current.some((line) => line.product.id === product.id) ? current : [...current, { product, qty: 1, unitPrice: product.sellingPrice }]);
    setQuery(""); setHits([]);
  }
  function submit() {
    setError("");
    startTransition(async () => {
      const result = await createLayaway({ customerId, lines: lines.map((line) => ({ productId: line.product.id, qty: line.qty, unitPrice: line.unitPrice })), discount, initialPayment, paymentMethod: method, paymentReference: reference, promisedPickupDate: pickup, notes });
      if (!result.ok || !result.id) return setError(result.error ?? "Could not create layaway.");
      router.push(`/layaways/${result.id}${result.paymentId ? `?receipt=${result.paymentId}` : ""}`);
      router.refresh();
    });
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.75fr)]">
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-primary/20 bg-surface shadow-sm">
        <div className="border-b border-primary/15 bg-primary-soft/45 p-4">
        <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary"/><div><p className="font-bold text-primary-ink">Reserve now, hand over only after full payment</p><p className="mt-1 text-sm text-muted">This is not a credit sale. The goods remain in the shop and cannot be sold to anyone else.</p></div></div>
        </div>
        <div className="px-3 py-4 sm:px-6"><LayawayJourney activeStep={0}/></div>
      </div>
      <Card><CardHeader><CardTitle>Customer</CardTitle></CardHeader><CardContent><Label htmlFor="layaway-customer">Customer account</Label><CustomerSearchPicker customers={customers} value={customerId} onChange={setCustomerId} inputId="layaway-customer"/></CardContent></Card>
      <Card><CardHeader><CardTitle>Reserved products</CardTitle></CardHeader><CardContent>
        <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-faint"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, sticker number, model or name…" className="pl-9"/></div>
        {hits.length > 0 && <div className="mt-1 overflow-hidden rounded-xl border border-border">{hits.map((product) => <button type="button" key={product.id} disabled={product.stock < 1} onClick={() => add(product)} className="flex w-full items-center justify-between border-b border-border-subtle px-3 py-3 text-left last:border-0 hover:bg-input disabled:opacity-45"><span><span className="block text-sm font-bold">{product.name}</span><span className="font-mono text-xs text-muted">{product.code}</span></span><span className="text-right"><span className="block font-mono text-sm font-bold">{formatLKR(product.sellingPrice)}</span><span className="text-xs text-muted">{product.stock} available{product.reservedStock ? ` · ${product.reservedStock} reserved` : ""}</span></span></button>)}</div>}
        {lines.length === 0 ? <div className="py-10 text-center text-sm text-muted"><PackageCheck className="mx-auto mb-2 h-7 w-7 text-faint"/>Search and add products to reserve.</div> : <div className="mt-4 space-y-2">{lines.map((line) => <div key={line.product.id} className="rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{line.product.name}</p><p className="font-mono text-xs text-muted">{line.product.code} · {line.product.stock} available</p></div><Button size="icon" variant="ghost" onClick={() => setLines((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label={`Remove ${line.product.name}`}><Trash2 className="h-4 w-4"/></Button></div>
          <div className="mt-3 grid grid-cols-2 gap-3"><div><Label>Quantity</Label><Input type="number" min={1} max={line.product.stock} value={line.qty} onChange={(event) => setLines((current) => current.map((item) => item.product.id === line.product.id ? { ...item, qty: Math.max(1, Number(event.target.value)) } : item))}/></div><div><Label>Agreed unit price</Label><Input type="number" min={0} step=".01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item) => item.product.id === line.product.id ? { ...item, unitPrice: Number(event.target.value) } : item))}/></div></div>
        </div>)}</div>}
      </CardContent></Card>
    </div>
    <div><Card className="overflow-hidden border-primary/20 lg:sticky lg:top-4"><div className="border-b border-primary/15 bg-primary-soft/35 px-5 py-3"><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-primary-ink">Reservation docket</p><p className="mt-1 text-xs text-muted">Fixed-price customer agreement</p></div><CardHeader><CardTitle>Agreement summary</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2 border-b border-border-subtle pb-4 text-sm"><div className="flex justify-between"><span className="text-muted">Subtotal</span><span className="font-mono">{formatLKR(subtotal)}</span></div><div><Label htmlFor="layaway-discount">Discount</Label><Input id="layaway-discount" type="number" min={0} max={subtotal} value={discount} onChange={(event) => setDiscount(Number(event.target.value))}/></div><div className="flex justify-between pt-2 text-lg font-extrabold"><span>Fixed total</span><span className="font-mono">{formatLKR(total)}</span></div></div>
      <div><Label htmlFor="layaway-initial">Initial installment (optional)</Label><Input id="layaway-initial" type="number" min={0} max={total} step=".01" value={initialPayment} onChange={(event) => setInitialPayment(Number(event.target.value))}/><p className="mt-1 text-xs text-muted">Balance after today: {formatLKR(Math.max(0,total-initialPayment))}</p></div>
      {initialPayment > 0 && <div className="grid grid-cols-2 gap-2"><div><Label>Method</Label><Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option>CASH</option><option>BANK</option><option>CHEQUE</option><option>CARD</option></Select></div><div><Label>Reference</Label><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional"/></div></div>}
      <div><Label htmlFor="layaway-pickup">Promised pickup date</Label><Input id="layaway-pickup" type="date" value={pickup} onChange={(event) => setPickup(event.target.value)}/></div>
      <div><Label htmlFor="layaway-notes">Notes</Label><Textarea id="layaway-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agreement details, preferred contact time…"/></div>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger-ink">{error}</p>}
      <Button className="w-full" size="lg" disabled={pending || !customerId || !lines.length || total <= 0} onClick={submit}>{pending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Clock3 className="h-4 w-4"/>}Create & reserve goods</Button>
    </CardContent></Card></div>
  </div>;
}
