import Link from "next/link";
import { Search, ReceiptText } from "lucide-react";
import { Prisma, type VehicleSaleType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatLKR } from "@/lib/utils";

export const dynamic = "force-dynamic";
const types: VehicleSaleType[] = ["CASH", "EXTERNAL_FINANCE", "IN_HOUSE_CREDIT"];
export default async function VehicleSalesPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams; const q = (sp.q ?? "").trim(); const type = types.includes(sp.type as VehicleSaleType) ? sp.type as VehicleSaleType : undefined;
  const where: Prisma.VehicleSaleWhereInput = { ...(type ? { type } : {}), ...(q ? { OR: [{ vehicleLabelSnapshot: { contains: q, mode: "insensitive" } }, { engineNumberSnapshot: { contains: q, mode: "insensitive" } }, { chassisNumberSnapshot: { contains: q, mode: "insensitive" } }, { customer: { is: { name: { contains: q, mode: "insensitive" } } } }] } : {}) };
  const sales = await prisma.vehicleSale.findMany({ where, include: { customer: { select: { name: true } }, documentCase: { select: { status: true } } }, orderBy: { saleDate: "desc" }, take: 250 });
  return <div><PageHeader title="Vehicle sales" subtitle="Confirmed sales, customer collections, supplier settlements, and registration cases" /><Card><CardContent className="p-0"><form className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="pl-9" name="q" defaultValue={q} placeholder="Search vehicle, customer, engine or chassis…" /></div><Select name="type" defaultValue={type ?? ""} className="sm:w-52"><option value="">All sale methods</option>{types.map((t) => <option value={t} key={t}>{t.replaceAll("_", " ")}</option>)}</Select><Button type="submit" variant="outline">Filter</Button></form>{sales.length === 0 ? <div className="px-5 py-14 text-center"><ReceiptText className="mx-auto mb-2 h-9 w-9 text-faint" /><p className="text-sm font-semibold">No vehicle sales found.</p><p className="mt-1 text-xs text-muted">Start a sale from an available vehicle dossier.</p></div> : <><div className="md:hidden">{sales.map((s) => <Link href={`/vehicle-sales/${s.id}`} key={s.id} className="block border-b border-border-subtle p-4 hover:bg-input/50"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">VS-{String(s.saleNumber).padStart(6, "0")}</p><p className="mt-1 text-sm font-semibold">{s.vehicleLabelSnapshot}</p><p className="text-xs text-muted">{s.customer.name} · {formatDate(s.saleDate)}</p></div><Badge tone={s.status === "CONFIRMED" ? "green" : "red"}>{s.status}</Badge></div><p className="mt-3 text-right font-bold tabular-nums">{formatLKR(s.customerPrice)}</p></Link>)}</div><div className="hidden md:block"><Table><THead><TR><TH>Sale</TH><TH>Vehicle</TH><TH>Customer</TH><TH>Method</TH><TH>Documents</TH><TH>Date</TH><TH className="text-right">Customer price</TH></TR></THead><TBody>{sales.map((s) => <TR key={s.id}><TD><Link href={`/vehicle-sales/${s.id}`} className="font-mono text-xs font-bold text-primary hover:underline">VS-{String(s.saleNumber).padStart(6, "0")}</Link></TD><TD>{s.vehicleLabelSnapshot}</TD><TD>{s.customer.name}</TD><TD><Badge tone="gray">{s.type.replaceAll("_", " ")}</Badge></TD><TD><Badge tone={s.documentCase?.status === "HANDED_OVER" ? "green" : "amber"}>{s.documentCase?.status.replaceAll("_", " ") ?? "—"}</Badge></TD><TD className="text-muted">{formatDate(s.saleDate)}</TD><TD className="text-right font-semibold tabular-nums">{formatLKR(s.customerPrice)}</TD></TR>)}</TBody></Table></div></>}</CardContent></Card></div>;
}
