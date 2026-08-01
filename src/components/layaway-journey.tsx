import type { CSSProperties } from "react";
import { Check, Handshake, PackageCheck, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { label: "Reserve", note: "Goods held", icon: PackageCheck },
  { label: "Pay", note: "Installments", icon: WalletCards },
  { label: "Ready", note: "Fully paid", icon: Check },
  { label: "Collect", note: "Handed over", icon: Handshake },
];

export function LayawayJourney({ activeStep = 0 }: { activeStep?: number }) {
  return <div className="relative grid grid-cols-4" aria-label="Layaway lifecycle">
    <div className="absolute left-[12.5%] right-[12.5%] top-4 h-px bg-border" aria-hidden="true"><span className="motion-workflow-fill block h-full origin-left bg-primary" style={{ "--workflow-progress": Math.max(0, Math.min(1, activeStep / 3)) } as CSSProperties}/></div>
    {steps.map((step, index) => <div key={step.label} className="relative z-10 flex flex-col items-center text-center" style={{ "--workflow-index": index } as CSSProperties}>
      <span className={cn("motion-workflow-node flex h-8 w-8 items-center justify-center rounded-lg border bg-surface shadow-sm", index <= activeStep ? "border-primary bg-primary text-primary-foreground" : "border-border text-faint", index === activeStep && "motion-workflow-current ring-4 ring-primary-soft")}><step.icon className="h-4 w-4"/></span>
      <span className={cn("motion-workflow-label mt-2 text-[11px] font-extrabold", index <= activeStep ? "text-foreground" : "text-muted")}>{step.label}</span>
      <span className="motion-workflow-label mt-0.5 hidden text-[9px] text-muted sm:block">{step.note}</span>
    </div>)}
  </div>;
}
