import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type VehicleTone = "neutral" | "success" | "processing" | "warning" | "danger";

const toneClasses: Record<VehicleTone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function VehicleStatus({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: VehicleTone; className?: string }) {
  return <Badge tone="gray" className={cn(toneClasses[tone], className)}>{children}</Badge>;
}

export function vehicleStatusTone(status: string): VehicleTone {
  if (["AVAILABLE", "CONFIRMED", "PAID", "SETTLED", "APPROVED", "REGISTERED", "HANDED_OVER", "RETURNED"].includes(status)) return "success";
  if (["SUBMITTED", "PROCESSING", "RECEIVED", "DOCUMENTS_RECEIVED"].includes(status)) return "processing";
  if (["RESERVED", "REQUIRED", "AWAITING_CUSTOMER_DOCUMENTS", "ACTIVE"].includes(status)) return "warning";
  if (["VOIDED", "CANCELLED", "DEFAULTED"].includes(status)) return "danger";
  return "neutral";
}
