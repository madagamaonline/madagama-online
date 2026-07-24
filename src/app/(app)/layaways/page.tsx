import Link from "next/link";
import { Clock3, PackageCheck, Plus, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatLKR, toNum } from "@/lib/utils";
import { layawayBalance } from "@/lib/layaway";
export const dynamic = "force-dynamic";
const meta = { ACTIVE: { label: "Paying", tone: "blue" }, PAID_AWAITING_PICKUP: { label: "Ready for pickup", tone: "amber" }, RELEASED: { label: "Collected", tone: "green" }, CANCELLED: { label: "Cancelled", tone: "red" } } as const;
export default async function LayawaysPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const filters = await searchParams; const q = filters.q?.trim() ?? "";
  const statusFilter = (["ACTIVE", "PAID_AWAITING_PICKUP", "RELEASED", "CANCELLED"] as const).find((status) => status === filters.status);
  const rows = await prisma.layawayOrder.findMany({ where: { ...(statusFilter ? { status: statusFilter } : {}), ...(q ? { OR: [{ customer: { name: { contains: q, mode: "insensitive" } } }, ...(/^\d+$/.test(q) ? [{ orderNumber: Number(q) }] : [])] } : {}) }, include: { customer: { select: { name: true, phone: true } }, items: { select: { nameSnapshot: true, qty: true } } }, orderBy: { createdAt: "desc" } });
  const all = await prisma.layawayOrder.groupBy({ by: ["status"], _count: true, _sum: { total: true, collectedAmount: true } });
  const activeValue = all.filter((item) => item.status === "ACTIVE" || item.status === "PAID_AWAITING_PICKUP").reduce((sum, item) => sum + toNum(item._sum.total), 0);
  const collected = all.filter((item) => item.status !== "CANCELLED").reduce((sum, item) => sum + toNum(item._sum.collectedAmount), 0);
  const mobileMoney = (value: number) => value >= 1_000_000 ? `LKR ${(value/1_000_000).toFixed(1)}m` : value >= 1_000 ? `LKR ${Math.round(value/1_000)}k` : formatLKR(value);
  return <div><PageHeader title="Layaways" subtitle="Reserved goods paid in installments before customer collection." action={<Link href="/layaways/new"><Button><Plus className="h-4 w-4"/>New layaway</Button></Link>}/>
    <section className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">{[{label:"Open orders",value:String(all.filter((x)=>x.status==="ACTIVE"||x.status==="PAID_AWAITING_PICKUP").reduce((s,x)=>s+x._count,0)),mobile:null},{label:"Reserved value",value:formatLKR(activeValue),mobile:mobileMoney(activeValue)},{label:"Collected",value:formatLKR(collected),mobile:mobileMoney(collected)}].map((item)=><Card key={item.label}><CardContent className="p-3 sm:p-5"><p className="text-[9px] font-bold uppercase text-muted sm:text-[10px]">{item.label}</p><p className="mt-2 font-mono text-base font-extrabold sm:text-xl">{item.mobile ? <><span className="sm:hidden">{item.mobile}</span><span className="hidden sm:inline">{item.value}</span></> : item.value}</p></CardContent></Card>)}</section>
    <form className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2"><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-faint"/><Input name="q" defaultValue={q} className="pl-9" placeholder="Customer or order number…"/></div><Select name="status" defaultValue={filters.status ?? "ALL"}><option value="ALL">All statuses</option><option value="ACTIVE">Paying</option><option value="PAID_AWAITING_PICKUP">Ready</option><option value="RELEASED">Collected</option><option value="CANCELLED">Cancelled</option></Select><Button size="sm">Filter</Button></form>
    {rows.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-surface py-14 text-center"><PackageCheck className="mx-auto h-8 w-8 text-faint"/><p className="mt-3 font-bold">No layaways found</p><p className="text-sm text-muted">Create one to reserve goods while a customer pays.</p></div> :
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">{rows.map((order) => { const status = meta[order.status]; const balance = layawayBalance(toNum(order.total), toNum(order.collectedAmount)); return <Link key={order.id} href={`/layaways/${order.id}`} className="grid gap-3 border-b border-border-subtle p-4 last:border-0 hover:bg-input sm:grid-cols-[.7fr_1.3fr_1fr_.8fr] sm:items-center"><div><p className="font-mono text-sm font-bold text-primary">LAY-{String(order.orderNumber).padStart(6,"0")}</p><p className="text-xs text-muted">{formatDate(order.createdAt)}</p></div><div><p className="font-bold">{order.customer.name}</p><p className="truncate text-xs text-muted">{order.items.map((item)=>`${item.qty}× ${item.nameSnapshot}`).join(", ")}</p></div><div><Badge tone={status.tone}>{status.label}</Badge>{order.promisedPickupDate && <p className="mt-1 flex items-center gap-1 text-xs text-muted"><Clock3 className="h-3 w-3"/>Promised {formatDate(order.promisedPickupDate)}</p>}</div><div className="sm:text-right"><p className="text-[10px] uppercase text-muted">Outstanding</p><p className="font-mono font-extrabold">{formatLKR(balance)}</p></div></Link>; })}</div>}
  </div>;
}
