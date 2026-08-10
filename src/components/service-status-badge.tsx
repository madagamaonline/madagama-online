import type { ServiceJobStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const tone: Record<ServiceJobStatus, "amber" | "blue" | "green" | "gray"> = {
  PENDING: "amber",
  IN_PROGRESS: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export const serviceStatusLabel: Record<ServiceJobStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function ServiceStatusBadge({ status }: { status: ServiceJobStatus }) {
  return <Badge tone={tone[status]}>{serviceStatusLabel[status]}</Badge>;
}
