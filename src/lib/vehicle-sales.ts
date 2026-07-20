import type {
  VehicleDocumentCaseStatus,
  VehicleSaleType,
} from "@prisma/client";
import { round2 } from "./utils";

export type VehicleDeal = {
  listPrice: number;
  supplierSettlementDue: number;
  customerDiscount: number;
  grossDealerCommission: number;
  customerPrice: number;
  netDealerCommission: number;
};

export function computeVehicleDeal(input: {
  listPrice: number;
  supplierSettlementDue: number;
  customerDiscount?: number;
}): VehicleDeal {
  const listPrice = round2(input.listPrice);
  const supplierSettlementDue = round2(input.supplierSettlementDue);
  const customerDiscount = round2(input.customerDiscount ?? 0);
  return {
    listPrice,
    supplierSettlementDue,
    customerDiscount,
    grossDealerCommission: round2(listPrice - supplierSettlementDue),
    customerPrice: round2(listPrice - customerDiscount),
    netDealerCommission: round2(listPrice - customerDiscount - supplierSettlementDue),
  };
}

export function validateVehicleDeal(
  deal: VehicleDeal,
  options: { allowLoss?: boolean; lossOverrideReason?: string | null } = {},
): string | null {
  if (!Number.isFinite(deal.listPrice) || deal.listPrice <= 0) return "Enter a valid list price.";
  if (!Number.isFinite(deal.supplierSettlementDue) || deal.supplierSettlementDue < 0) {
    return "Enter a valid amount payable to the supplier.";
  }
  if (deal.supplierSettlementDue > deal.listPrice) {
    return "The supplier amount cannot be greater than the list price.";
  }
  if (!Number.isFinite(deal.customerDiscount) || deal.customerDiscount < 0) {
    return "Enter a valid customer discount.";
  }
  if (deal.customerPrice < 0) return "The discount cannot be greater than the list price.";
  if (deal.netDealerCommission < 0 && !options.allowLoss) {
    return "The discount is greater than the dealer commission. Administrator approval is required.";
  }
  if (deal.netDealerCommission < 0 && !options.lossOverrideReason?.trim()) {
    return "Enter a reason for approving this loss-making sale.";
  }
  return null;
}

export function validateInitialVehiclePayment(input: {
  saleType: VehicleSaleType;
  customerPrice: number;
  downPayment: number;
  financeApprovedAmount?: number | null;
}): string | null {
  const price = round2(input.customerPrice);
  const paid = round2(input.downPayment);
  if (!Number.isFinite(paid) || paid < 0) return "Enter a valid payment amount.";
  if (input.saleType === "CASH" && paid !== price) {
    return "A cash sale must be paid in full.";
  }
  if (input.saleType !== "CASH" && paid >= price) {
    return "Use a cash sale when the customer pays the full vehicle price.";
  }
  if (input.saleType === "EXTERNAL_FINANCE") {
    const approved = round2(input.financeApprovedAmount ?? 0);
    if (approved <= 0) return "Enter the amount approved by the finance provider.";
    if (round2(approved + paid) < price) {
      return "The approved finance amount plus down payment does not cover the customer price.";
    }
  }
  return null;
}

export function customerOutstanding(input: {
  saleType: VehicleSaleType;
  customerPrice: number;
  customerCollected: number;
}): number {
  if (input.saleType === "EXTERNAL_FINANCE") return 0;
  return Math.max(0, round2(input.customerPrice - input.customerCollected));
}

export function supplierOutstanding(supplierDue: number, supplierPaid: number): number {
  return Math.max(0, round2(supplierDue - supplierPaid));
}

const DOCUMENT_TRANSITIONS: Record<VehicleDocumentCaseStatus, VehicleDocumentCaseStatus[]> = {
  AWAITING_CUSTOMER_DOCUMENTS: ["DOCUMENTS_RECEIVED", "CANCELLED"],
  DOCUMENTS_RECEIVED: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PROCESSING", "REGISTERED", "CANCELLED"],
  PROCESSING: ["REGISTERED", "CANCELLED"],
  REGISTERED: ["HANDED_OVER"],
  HANDED_OVER: [],
  CANCELLED: [],
};

export function canTransitionVehicleDocuments(
  from: VehicleDocumentCaseStatus,
  to: VehicleDocumentCaseStatus,
): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export function formatVehicleNumber(number: number): string {
  return `VH-${String(number).padStart(6, "0")}`;
}

export function formatVehicleSaleNumber(number: number): string {
  return `VS-${String(number).padStart(6, "0")}`;
}

export function formatVehicleReceiptNumber(number: number): string {
  return `VREC-${String(number).padStart(6, "0")}`;
}
