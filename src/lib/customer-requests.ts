import type {
  CustomerRequestPriority,
  CustomerRequestStatus,
  CustomerRequestType,
} from "@prisma/client";

export const ACTIVE_REQUEST_STATUSES: CustomerRequestStatus[] = [
  "NEW",
  "SEARCHING",
  "ORDERED",
  "ARRIVED",
  "CONTACTED",
];

export const REQUEST_STATUS_OPTIONS: { value: CustomerRequestStatus; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "SEARCHING", label: "Searching" },
  { value: "ORDERED", label: "Ordered" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "CONTACTED", label: "Customer contacted" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const REQUEST_TYPE_OPTIONS: { value: CustomerRequestType; label: string }[] = [
  { value: "PRODUCT_INQUIRY", label: "Product inquiry" },
  { value: "IMPORT_REQUEST", label: "Import request" },
  { value: "PRICE_INQUIRY", label: "Price inquiry" },
  { value: "OTHER", label: "Other" },
];

export const REQUEST_PRIORITY_OPTIONS: { value: CustomerRequestPriority; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "LOW", label: "Low" },
];

export function requestNumber(number: number): string {
  return `REQ-${String(number).padStart(4, "0")}`;
}

export function requestStatusLabel(status: CustomerRequestStatus): string {
  return REQUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function requestTypeLabel(type: CustomerRequestType): string {
  return REQUEST_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function requestStatusTone(
  status: CustomerRequestStatus,
): "gray" | "green" | "red" | "amber" | "blue" {
  if (status === "COMPLETED") return "green";
  if (status === "CANCELLED") return "red";
  if (status === "ARRIVED" || status === "CONTACTED") return "amber";
  if (status === "SEARCHING" || status === "ORDERED") return "blue";
  return "gray";
}
