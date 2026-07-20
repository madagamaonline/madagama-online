import Link from "next/link";
import { Prisma, type ConsignmentVehicleStatus } from "@prisma/client";
import { Plus, Search, Tractor, Warehouse, BadgeDollarSign } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatLKR, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";
const statuses: ConsignmentVehicleStatus[] = ["AVAILABLE", "RESERVED", "SOLD", "RETURNED"];
const labels = { TRACTOR: "Tractor", HARVESTER: "Harvester", COMBINE_HARVESTER: "Combine harvester" } as const;
const statusTone = { DRAFT: "gray", AVAILABLE: "green", RESERVED: "amber", SOLD: "blue", RETURNED: "gray" } as const;

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; kind?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const requestedStatus = sp.status?.toUpperCase();
  const status = statuses.includes(requestedStatus as ConsignmentVehicleStatus) ? requestedStatus as ConsignmentVehicleStatus : undefined;
  const kinds = ["TRACTOR", "HARVESTER", "COMBINE_HARVESTER"] as const;
  const kind = kinds.includes(sp.kind as (typeof kinds)[number]) ? sp.kind as (typeof kinds)[number] : undefined;
  const where: Prisma.ConsignmentVehicleWhereInput = { ...(status ? { status } : {}), ...(kind ? { kind } : {}), ...(q ? { OR: [{ make: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }, { engineNumber: { contains: q, mode: "insensitive" } }, { chassisNumber: { contains: q, mode: "insensitive" } }, { supplier: { is: { name: { contains: q, mode: "insensitive" } } } }] } : {}) };
  const [vehicles, availableCount, reservedCount, soldCount, availableValue] = await Promise.all([
    prisma.consignmentVehicle.findMany({ where, include: { supplier: { select: { name: true } }, sales: { where: { status: "CONFIRMED" }, select: { id: true, saleNumber: true }, take: 1 } }, orderBy: { receivedAt: "desc" }, take: 250 }),
    prisma.consignmentVehicle.count({ where: { status: "AVAILABLE" } }),
    prisma.consignmentVehicle.count({ where: { status: "RESERVED" } }),
    prisma.consignmentVehicle.count({ where: { status: "SOLD" } }),
    prisma.consignmentVehicle.aggregate({ where: { status: "AVAILABLE" }, _sum: { listPrice: true } }),
  ]);

  return <div>
    <PageHeader title="Vehicles" subtitle="Supplier-owned tractors and harvesters held for sale" action={<Link href="/vehicles/new"><Button><Plus className="h-4 w-4" />Receive vehicle</Button></Link>} />
    <div className="mb-6 grid grid-cols-1 gap-3 min-[440px]:grid-cols-2 lg:grid-cols-4"><StatCard label="Available" value={String(availableCount)} tone="green" icon={Tractor} /><StatCard label="Reserved" value={String(reservedCount)} tone="amber" /><StatCard label="Sold" value={String(soldCount)} tone="blue" /><StatCard label="Available list value" value={formatLKR(availableValue._sum.listPrice)} icon={BadgeDollarSign} /></div>
    <Card><CardContent className="p-0"><form className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input name="q" defaultValue={q} className="pl-9" placeholder="Search make, model, engine, chassis or supplier…" /></div><Select name="kind" defaultValue={kind ?? ""} className="sm:w-48"><option value="">All vehicle types</option>{kinds.map((k) => <option key={k} value={k}>{labels[k]}</option>)}</Select><Select name="status" defaultValue={status ? status[0] + status.slice(1).toLowerCase() : ""} className="sm:w-40"><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</Select><Button type="submit" variant="outline">Filter</Button></form>
      {vehicles.length === 0 ? <div className="px-5 py-14 text-center"><Warehouse className="mx-auto mb-3 h-9 w-9 text-faint" /><p className="text-sm font-semibold">{q || status || kind ? "No vehicles match these filters." : "No consignment vehicles yet."}</p><p className="mt-1 text-xs text-muted">Receive each physical vehicle with its unique engine and chassis numbers.</p></div> : <><div className="md:hidden">{vehicles.map((v) => <Link key={v.id} href={`/vehicles/${v.id}`} className="block border-b border-border-subtle p-4 last:border-0 hover:bg-input/50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{v.make} {v.model}</p><p className="mt-0.5 text-xs text-muted">{labels[v.kind]} · {v.supplier.name}</p></div><Badge tone={statusTone[v.status]}>{v.status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-faint">Engine</span><p className="truncate font-mono">{v.engineNumber}</p></div><div><span className="text-faint">Chassis</span><p className="truncate font-mono">{v.chassisNumber}</p></div></div><p className="mt-3 text-right text-sm font-bold tabular-nums">{formatLKR(v.listPrice)}</p></Link>)}</div><div className="hidden md:block"><Table><THead><TR><TH>Vehicle</TH><TH>Engine / chassis</TH><TH>Supplier</TH><TH>Status</TH><TH>Received</TH><TH className="text-right">List price</TH></TR></THead><TBody>{vehicles.map((v) => <TR key={v.id}><TD><Link className="font-semibold text-primary hover:underline" href={`/vehicles/${v.id}`}>{v.make} {v.model}</Link><div className="text-xs text-muted">{labels[v.kind]}{v.year ? ` · ${v.year}` : ""}</div></TD><TD><div className="font-mono text-xs">{v.engineNumber}</div><div className="font-mono text-xs text-muted">{v.chassisNumber}</div></TD><TD>{v.supplier.name}</TD><TD><Badge tone={statusTone[v.status]}>{v.status}</Badge></TD><TD className="text-muted">{formatDate(v.receivedAt)}</TD><TD className="text-right font-semibold tabular-nums">{formatLKR(toNum(v.listPrice))}</TD></TR>)}</TBody></Table></div></>}
    </CardContent></Card>
  </div>;
}
