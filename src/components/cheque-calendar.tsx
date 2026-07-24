"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark, List, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { monthGrid, shiftMonth } from "@/lib/cheque-calendar";
import { cn, formatLKR } from "@/lib/utils";
import type { ChequeStatus } from "@/lib/cheques";

type Event = {
  id: string; dueKey: string; chequeNumber: string; supplier: string;
  bankAccountId: string; bank: string; account: string; amount: number;
  remaining: number; status: ChequeStatus;
};
const tones: Record<ChequeStatus, "amber" | "red" | "green"> = { UPCOMING: "amber", DUE: "amber", OVERDUE: "red", SETTLED: "green" };
const dot: Record<ChequeStatus, string> = { UPCOMING: "bg-primary", DUE: "bg-clay", OVERDUE: "bg-danger", SETTLED: "bg-success" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ChequeCalendar({ month, today, events, banks }: {
  month: string; today: string; events: Event[]; banks: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bank, setBank] = useState("");
  const [selected, setSelected] = useState(today.startsWith(month) ? today : `${month}-01`);
  const filtered = useMemo(() => events.filter((event) => !bank || event.bankAccountId === bank), [events, bank]);
  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const event of filtered) map.set(event.dueKey, [...(map.get(event.dueKey) ?? []), event]);
    return map;
  }, [filtered]);
  const overdue = filtered.filter((event) => event.status === "OVERDUE");
  const monthEvents = filtered.filter((event) => event.dueKey.startsWith(month) && event.remaining > 0);
  const sevenDaysOut = new Date(`${today}T00:00:00Z`); sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);
  const sevenDayKey = sevenDaysOut.toISOString().slice(0, 10);
  const nearTerm = filtered.filter((event) => event.remaining > 0 && event.dueKey >= today && event.dueKey <= sevenDayKey);
  const agenda = byDay.get(selected) ?? [];
  const cells = monthGrid(month, new Date(`${today}T00:00:00+05:30`));

  function move(delta: number) {
    startTransition(() => router.push(`/banking/calendar?month=${shiftMonth(month, delta)}`, { scroll: false }));
  }
  const monthTitle = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-LK", { month: "long", year: "numeric", timeZone: "UTC" });
  const selectedTitle = new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-LK", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return <div aria-busy={pending}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        <Link href="/banking"><Button size="sm" variant="ghost"><List className="h-4 w-4" /> List</Button></Link>
        <Button size="sm" variant="secondary" aria-current="page"><Landmark className="h-4 w-4" /> Calendar</Button>
      </div>
      <Select value={bank} onChange={(event) => setBank(event.target.value)} className="h-10 w-40 sm:w-60" aria-label="Filter calendar by bank">
        <option value="">All banks</option>{banks.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </Select>
    </div>

    <section className="mb-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" aria-label="Cheque risk summary">
      <div className="border-r border-border-subtle border-t-4 border-t-danger px-3 py-3 sm:px-5"><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-danger">Past due</p><p className="mt-1 truncate font-mono text-base font-black sm:text-xl">{formatLKR(overdue.reduce((sum,item)=>sum+item.remaining,0))}</p><p className="mt-1 text-[10px] text-muted">{overdue.length} exception{overdue.length===1?"":"s"}</p></div>
      <div className="border-r border-border-subtle border-t-4 border-t-clay px-3 py-3 sm:px-5"><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-clay">Next 7 days</p><p className="mt-1 truncate font-mono text-base font-black sm:text-xl">{formatLKR(nearTerm.reduce((sum,item)=>sum+item.remaining,0))}</p><p className="mt-1 text-[10px] text-muted">{nearTerm.length} cheque{nearTerm.length===1?"":"s"}</p></div>
      <div className="border-t-4 border-t-primary px-3 py-3 sm:px-5"><p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-primary">This month</p><p className="mt-1 truncate font-mono text-base font-black sm:text-xl">{formatLKR(monthEvents.reduce((sum,item)=>sum+item.remaining,0))}</p><p className="mt-1 text-[10px] text-muted">{monthEvents.length} open</p></div>
    </section>

    {overdue.length > 0 && <section className="mb-4 overflow-hidden rounded-2xl border border-danger/30 bg-surface shadow-[0_8px_24px_rgba(177,84,63,.08)]">
      <div className="flex items-center justify-between gap-3 border-l-4 border-danger bg-danger-soft/55 px-4 py-3">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" /><div><h2 className="text-sm font-extrabold text-danger-ink">Exceptions ledger</h2><p className="text-xs text-muted">Overdue commitments remain pinned until settled</p></div></div>
        <p className="font-mono text-sm font-black text-danger">{formatLKR(overdue.reduce((sum, item) => sum + item.remaining, 0))}</p>
      </div>
      <div>
        {overdue.slice(0, 6).map((item, index) => <Link key={item.id} href={`/banking/cheques/${item.id}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-danger/10 px-3 py-2.5 transition-colors hover:bg-danger-soft/35 sm:grid-cols-[2rem_1fr_1fr_auto] sm:px-4">
          <span className="font-mono text-[10px] font-bold text-danger">{String(index+1).padStart(2,"0")}</span><div className="min-w-0"><p className="truncate text-xs font-extrabold">{item.supplier}</p><p className="font-mono text-[10px] text-muted">#{item.chequeNumber}</p></div><p className="hidden truncate text-xs text-muted sm:block">{item.bank} · due {item.dueKey}</p><p className="font-mono text-xs font-black text-danger sm:text-sm">{formatLKR(item.remaining)}</p>
        </Link>)}
      </div>
    </section>}

    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border-subtle px-3 py-3 sm:px-5">
        <Button size="icon" variant="outline" onClick={() => move(-1)} disabled={pending} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted">Cheque commitments</p><h2 className="text-lg font-extrabold">{monthTitle}</h2></div>
        <Button size="icon" variant="outline" onClick={() => move(1)} disabled={pending} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
      </header>
      <div className="grid grid-cols-7 bg-border">
        {WEEKDAYS.map((day) => <div key={day} className="bg-input py-2 text-center text-[10px] font-bold uppercase text-muted">{day}</div>)}
        {cells.map((cell) => {
          const items = byDay.get(cell.key) ?? [];
          const remaining = items.reduce((sum, item) => sum + item.remaining, 0);
          const selectedDay = cell.key === selected;
          return <button type="button" key={cell.key} onClick={() => setSelected(cell.key)} aria-pressed={selectedDay} aria-label={`${cell.key}, ${items.length} cheques, ${formatLKR(remaining)} remaining`}
            className={cn("relative min-h-17 bg-surface p-1.5 text-left transition-colors hover:bg-primary-soft/30 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-24 sm:p-2", !cell.inMonth && "bg-input/60 text-faint", items.some((item)=>item.status==="OVERDUE") && "bg-danger-soft/35", items.some((item)=>item.status==="DUE") && "bg-clay-soft/45", selectedDay && "z-10 bg-primary-soft/60 ring-2 ring-inset ring-primary", cell.isToday && !selectedDay && "ring-1 ring-inset ring-clay")}>
            <span className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md text-xs font-bold", cell.isToday && "bg-clay text-white")}>{cell.day}</span>
            {items.length > 0 && <div className="mt-1">
              <div className="flex items-center gap-1"><span className="text-[10px] font-bold tabular-nums">{items.length}</span>{[...new Set(items.map((item) => item.status))].map((status) => <span key={status} className={cn("h-1.5 w-1.5 rounded-full", dot[status])} />)}</div>
              <p className={cn("mt-1 truncate font-mono text-[9px] font-black sm:text-[11px]", items.some((item)=>item.status==="OVERDUE") && "text-danger")}>{formatLKR(remaining)}</p>
              <div className="mt-1 hidden space-y-1 sm:block">{items.slice(0, 2).map((item) => <p key={item.id} className={cn("truncate rounded px-1 py-0.5 text-[9px] font-semibold", item.status === "OVERDUE" ? "bg-danger-soft text-danger-ink" : "bg-primary-soft text-primary-ink")}>{item.supplier}</p>)}</div>
            </div>}
          </button>;
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-3 text-[11px] text-muted" aria-label="Calendar legend">
        {([["UPCOMING","Upcoming"],["DUE","Due today"],["OVERDUE","Overdue"],["SETTLED","Settled"]] as const).map(([status,label]) => <span key={status} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", dot[status])}/>{label}</span>)}
      </div>
    </section>

    <section className="mt-4" aria-live="polite">
      <div className="mb-2 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted">Selected day</p><h2 className="text-lg font-extrabold">{selectedTitle}</h2></div><p className="font-mono text-sm font-bold">{formatLKR(agenda.reduce((sum, item) => sum + item.remaining, 0))}</p></div>
      {agenda.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-10 text-center"><WalletCards className="mx-auto h-7 w-7 text-faint"/><p className="mt-2 font-semibold">No cheques due</p><p className="text-sm text-muted">Tap another date to inspect its commitments.</p></div> :
        <div className="space-y-2">{agenda.map((item) => <Link key={item.id} href={`/banking/cheques/${item.id}`} className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-input">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-bold">{item.supplier}</p><Badge tone={tones[item.status]}>{item.status === "DUE" ? "Due today" : item.status.toLowerCase()}</Badge></div><p className="mt-1 text-xs text-muted">{item.bank} · {item.account}</p><p className="mt-1 font-mono text-xs text-primary">Cheque #{item.chequeNumber}</p></div><div className="shrink-0 text-right"><p className="text-[10px] uppercase text-muted">Remaining</p><p className={cn("font-mono text-base font-extrabold", item.status === "OVERDUE" && "text-danger")}>{formatLKR(item.remaining)}</p><p className="text-[10px] text-muted">of {formatLKR(item.amount)}</p></div></div>
        </Link>)}</div>}
    </section>
  </div>;
}
