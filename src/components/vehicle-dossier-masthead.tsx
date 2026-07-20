import { Tractor } from "lucide-react";
import { VehicleStatus, vehicleStatusTone } from "@/components/vehicle-status";

export function VehicleDossierMasthead({ vehicleNumber, label, kind, status, engineNumber, chassisNumber, supplier, action, compact = false }: { vehicleNumber?: number | string; label: string; kind?: string; status: string; engineNumber: string; chassisNumber: string; supplier?: string; action?: React.ReactNode; compact?: boolean }) {
  return <section className="mb-4 overflow-hidden rounded-2xl border border-slate-300 bg-slate-950 text-white shadow-sm dark:border-slate-700" aria-label="Vehicle dossier identity">
    <div className={compact ? "p-4" : "p-4 sm:p-5"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Tractor className="h-7 w-7 text-amber-300" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-bold tracking-[0.16em] text-slate-400">{vehicleNumber ? `VEHICLE ${vehicleNumber}` : "VEHICLE DOSSIER"}</span><VehicleStatus tone={vehicleStatusTone(status)}>{status.replaceAll("_", " ")}</VehicleStatus></div><h2 className={compact ? "mt-1 text-lg font-extrabold" : "mt-1 text-xl font-extrabold sm:text-2xl"}>{label}</h2><p className="mt-1 text-xs text-slate-400">{[kind?.replaceAll("_", " "), supplier].filter(Boolean).join(" · ")}</p></div>{action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-white/10 min-[440px]:grid-cols-2"><div className="bg-slate-900 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Engine number</p><p className="mt-0.5 break-all font-mono text-sm font-semibold">{engineNumber}</p></div><div className="bg-slate-900 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Chassis number</p><p className="mt-0.5 break-all font-mono text-sm font-semibold">{chassisNumber}</p></div></div>
    </div>
  </section>;
}
