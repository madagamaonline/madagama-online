import type { QuotationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

// Plain (server-safe) module — do NOT add "use client". Server components import
// these maps directly; a client module's plain exports don't resolve server-side.

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export const quotationStatusTone: Record<QuotationStatus, "gray" | "amber" | "green" | "red" | "blue"> = {
  DRAFT: "gray",
  SENT: "blue",
  ACCEPTED: "green",
  DECLINED: "red",
  EXPIRED: "amber",
};

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  return <Badge tone={quotationStatusTone[status]}>{quotationStatusLabel[status]}</Badge>;
}
