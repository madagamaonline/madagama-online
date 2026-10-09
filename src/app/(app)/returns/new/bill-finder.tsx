import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Search, Undo2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Highlight } from "@/components/highlight";
import { contains, parseSearchQuery, tokenMatchWhere } from "@/lib/search";
import { addDays, businessDaysBetween, parseBusinessDateInput } from "@/lib/dates";
import { formatDate, formatLKR } from "@/lib/utils";

/**
 * Customers often come back without the receipt, so a bill can be found by
 * invoice number, customer name or phone, or a product on it — optionally
 * narrowed to the dates they remember buying.
 */
export async function BillFinder({ q, from, to }: { q?: string; from?: string; to?: string }) {
  const query = parseSearchQuery(q);
  const fromDate = parseBusinessDateInput(from);
  const toDate = parseBusinessDateInput(to);
  const filtered = !query.isEmpty || fromDate || toDate;

  const where: Prisma.InvoiceWhereInput = {
    voidedAt: null,
    ...(fromDate || toDate
      ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: addDays(toDate, 1) } : {}) } }
      : {}),
    ...(tokenMatchWhere<Prisma.InvoiceWhereInput>(query.tokens, (token) => [
      { invoiceNumber: contains(token) },
      { customer: { name: contains(token) } },
      { customer: { phone: contains(token) } },
      { items: { some: { OR: [{ nameSnapshot: contains(token) }, { codeSnapshot: contains(token) }] } } },
    ]) ?? {}),
  };
  // A typed phone number (any format) should find the customer's normalised number.
  const phoneWhere: Prisma.InvoiceWhereInput | null = query.phone
    ? { voidedAt: null, customer: { phone: query.phone } }
    : null;

  const invoices = await prisma.invoice.findMany({
    where: phoneWhere ? { OR: [where, phoneWhere] } : where,
    orderBy: { createdAt: "desc" },
    take: filtered ? 40 : 15,
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      grandTotal: true,
      type: true,
      customer: { select: { name: true, phone: true } },
      items: { select: { productId: true, nameSnapshot: true, codeSnapshot: true } },
      _count: { select: { returns: true } },
    },
  });

  const matchesItem = (item: { nameSnapshot: string; codeSnapshot: string | null }) =>
    query.tokens.length > 0 &&
    query.tokens.some((t) => item.nameSnapshot.toLowerCase().includes(t) || (item.codeSnapshot ?? "").toLowerCase().includes(t));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
            <div>
              <Label htmlFor="bill-q">Invoice no., customer, phone or product</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input id="bill-q" name="q" defaultValue={q ?? ""} placeholder="e.g. 0771234567 or grinder" className="pl-9" autoFocus />
              </div>
            </div>
            <div>
              <Label htmlFor="bill-from">Bought from</Label>
              <Input id="bill-from" name="from" type="date" defaultValue={from ?? ""} />
            </div>
            <div>
              <Label htmlFor="bill-to">to</Label>
              <Input id="bill-to" name="to" type="date" defaultValue={to ?? ""} />
            </div>
            <Button type="submit"><Search className="h-4 w-4" /> Find bill</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            {filtered ? `${invoices.length}${invoices.length === 40 ? "+" : ""} matching bill${invoices.length === 1 ? "" : "s"}` : "Recent bills"}
          </div>
          {invoices.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">No bills match. Try the phone number, part of the product name, or a wider date range.</p>
          ) : (
            <ul className="divide-y divide-border">
              {invoices.map((inv) => {
                const matched = inv.items.filter(matchesItem);
                const shown = (matched.length ? matched : inv.items).slice(0, 3);
                const more = inv.items.length - shown.length;
                const days = businessDaysBetween(inv.createdAt);
                const onlyMatch = matched.length === 1 ? matched[0]?.productId : null;
                return (
                  <li key={inv.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary-ink">
                          <Highlight text={inv.invoiceNumber} query={q ?? ""} />
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(inv.createdAt)} · {days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}
                        </span>
                        {inv._count.returns > 0 && <Badge tone="amber">Has returns</Badge>}
                      </div>
                      <div className="text-sm">
                        <Highlight text={inv.customer?.name ?? "Walk-in"} query={q ?? ""} />
                        {inv.customer?.phone && <span className="ml-2 text-xs text-muted">{inv.customer.phone}</span>}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {shown.map((it, i) => (
                          <span key={`${it.productId}-${i}`}>
                            {i > 0 && ", "}
                            <Highlight text={it.nameSnapshot} query={q ?? ""} />
                          </span>
                        ))}
                        {more > 0 && ` +${more} more`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <span className="tabular text-sm font-semibold">{formatLKR(inv.grandTotal)}</span>
                      <Link href={`/returns/new?invoice=${inv.id}${onlyMatch ? `&product=${onlyMatch}` : ""}`}>
                        <Button size="sm" variant="outline"><Undo2 className="h-4 w-4" /> Return / exchange</Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
