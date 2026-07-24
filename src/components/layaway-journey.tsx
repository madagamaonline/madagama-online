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
    <div className="absolute left-[12.5%] right-[12.5%] top-4 h-px bg-border" aria-hidden="true"><span className="block h-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, activeStep / 3 * 100))}%` }}/></div>
    {steps.map((step, index) => <div key={step.label} className="relative z-10 flex flex-col items-center text-center">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border bg-surface shadow-sm", index <= activeStep ? "border-primary bg-primary text-primary-foreground" : "border-border text-faint")}><step.icon className="h-4 w-4"/></span>
      <span className={cn("mt-2 text-[11px] font-extrabold", index <= activeStep ? "text-foreground" : "text-muted")}>{step.label}</span>
      <span className="mt-0.5 hidden text-[9px] text-muted sm:block">{step.note}</span>
    </div>)}
  </div>;
}
