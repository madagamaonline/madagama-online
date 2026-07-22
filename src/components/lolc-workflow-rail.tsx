import type { LolcReceiptStatus } from "@prisma/client";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { ageInDays, lolcStatusLabel } from "@/lib/lolc-receipts";
import { cn } from "@/lib/utils";

const nextActions: Record<LolcReceiptStatus, string> = {
  COLLECTED: "Send through mCash",
  MCASH_SENT: "Verify with LOLC",
  NEEDS_ATTENTION: "Resolve and confirm",
  LOLC_CONFIRMED: "Journey complete",
  VOIDED: "No further action",
};

export function lolcNextAction(status: LolcReceiptStatus): string {
  return nextActions[status];
}

export function LolcWorkflowRail({
  status,
  collectedAt,
  mCashSent,
  lolcConfirmed,
  compact = false,
  className,
}: {
  status: LolcReceiptStatus;
  collectedAt: Date;
  mCashSent: boolean;
  lolcConfirmed: boolean;
  compact?: boolean;
  className?: string;
}) {
  const attention = status === "NEEDS_ATTENTION";
  const voided = status === "VOIDED";
  const age = ageInDays(collectedAt);
  const steps = [
    { label: "Collected", done: true },
    { label: "mCash sent", done: mCashSent },
    { label: attention ? "Attention required" : "LOLC confirmed", done: lolcConfirmed },
  ];

  return <div className={cn("min-w-0", className)}>
    <div className={cn("flex items-start", compact ? "max-w-[210px]" : "w-full")} aria-label={`Workflow: ${lolcStatusLabel(status)}`}>
      {steps.map((step, index) => {
        const interrupted = attention && index === 2;
        const current = !voided && !interrupted && ((status === "COLLECTED" && index === 0) || (status === "MCASH_SENT" && index === 1));
        const Icon = interrupted ? AlertTriangle : Check;
        return <div key={step.label} className="contents">
          {index > 0 && <span className={cn(
            "mt-[13px] h-0.5 min-w-3 flex-1",
            interrupted ? "border-t-2 border-dashed border-danger bg-transparent" : step.done ? "bg-primary" : "bg-border",
          )} />}
          <div className={cn("flex shrink-0 flex-col items-center text-center", compact ? "w-8" : "w-[92px]")}>
            <span className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-black shadow-sm",
              interrupted ? "border-danger bg-danger-soft text-danger" :
                voided ? "border-border bg-border-subtle text-muted" :
                  step.done ? "border-primary bg-primary text-primary-foreground" :
                    "border-border bg-surface text-faint",
              current && "ring-4 ring-primary/15",
            )}>
              {voided && index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : interrupted ? <Icon className="h-3.5 w-3.5" /> : step.done && !current ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            {!compact && <span className={cn("mt-2 text-[11px] font-semibold leading-tight", interrupted ? "text-danger" : step.done && !voided ? "text-foreground" : "text-muted")}>{step.label}</span>}
          </div>
        </div>;
      })}
    </div>
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", compact ? "mt-1" : "mt-4 border-t border-border-subtle pt-3")}>
      <span className={cn("font-semibold", compact ? "text-[10px]" : "text-xs", attention ? "text-danger" : voided ? "text-muted" : "text-foreground")}>{lolcNextAction(status)}</span>
      {!lolcConfirmed && !voided && <><span className="text-faint">·</span><span className={cn("tabular text-muted", compact ? "text-[10px]" : "text-xs")}>{age === 0 ? "today" : `${age}d in queue`}</span></>}
    </div>
  </div>;
}
