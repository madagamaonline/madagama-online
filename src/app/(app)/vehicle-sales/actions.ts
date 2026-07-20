"use server";

import crypto from "crypto";
import {
  Prisma,
  type VehicleAcknowledgementType,
  type VehicleDocumentCaseStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  requireActionAdmin,
  requireActionStaffFinanceAccess,
  requireActionUser,
} from "@/lib/auth";
import { computeCreditState } from "@/lib/credit";
import { prisma } from "@/lib/prisma";
import { round2, toNum } from "@/lib/utils";
import {
  canTransitionVehicleDocuments,
  computeVehicleDeal,
  validateInitialVehiclePayment,
  validateVehicleDeal,
} from "@/lib/vehicle-sales";

export type VehicleSaleFormState = { error?: string };
export type VehicleActionState = { error?: string; ok?: boolean };

const METHODS = ["CASH", "BANK", "CHEQUE", "CARD"] as const;
const saleSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  customerId: z.string().min(1, "Select a customer"),
  soldByEmployeeId: z.string().optional(),
  type: z.enum(["CASH", "EXTERNAL_FINANCE", "IN_HOUSE_CREDIT"]),
  customerDiscount: z.coerce.number().min(0).default(0),
  downPayment: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(METHODS).default("CASH"),
  paymentReference: z.string().trim().optional(),
  saleDate: z.string().optional(),
  notes: z.string().trim().optional(),
  lossOverrideReason: z.string().trim().optional(),
  financeProvider: z.string().trim().optional(),
  financeReference: z.string().trim().optional(),
  financeApprovedAmount: z.coerce.number().min(0).optional(),
  financeApprovedAt: z.string().optional(),
  firstDueDate: z.string().optional(),
  termMonths: z.coerce.number().int().positive().optional(),
  expectedInstallment: z.coerce.number().positive().optional(),
  interestRatePerMonth: z.coerce.number().min(0).max(100).optional(),
  interestFreeMonths: z.coerce.number().int().min(0).optional(),
  guarantorName: z.string().trim().optional(),
  guarantorNic: z.string().trim().optional(),
  guarantorPhone: z.string().trim().optional(),
});

function optionalNumber(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

function parseSale(formData: FormData) {
  return saleSchema.safeParse({
    vehicleId: formData.get("vehicleId"),
    customerId: formData.get("customerId"),
    soldByEmployeeId: formData.get("soldByEmployeeId") || undefined,
    type: formData.get("type"),
    customerDiscount: formData.get("customerDiscount") || 0,
    downPayment: formData.get("downPayment") || 0,
    paymentMethod: formData.get("paymentMethod") || "CASH",
    paymentReference: formData.get("paymentReference") || undefined,
    saleDate: formData.get("saleDate") || undefined,
    notes: formData.get("notes") || undefined,
    lossOverrideReason: formData.get("lossOverrideReason") || undefined,
    financeProvider: formData.get("financeProvider") || undefined,
    financeReference: formData.get("financeReference") || undefined,
    financeApprovedAmount: optionalNumber(formData, "financeApprovedAmount"),
    financeApprovedAt: formData.get("financeApprovedAt") || undefined,
    firstDueDate: formData.get("firstDueDate") || undefined,
    termMonths: optionalNumber(formData, "termMonths"),
    expectedInstallment: optionalNumber(formData, "expectedInstallment"),
    interestRatePerMonth: optionalNumber(formData, "interestRatePerMonth"),
    interestFreeMonths: optionalNumber(formData, "interestFreeMonths"),
    guarantorName: formData.get("guarantorName") || undefined,
    guarantorNic: formData.get("guarantorNic") || undefined,
    guarantorPhone: formData.get("guarantorPhone") || undefined,
  });
}

export async function createVehicleSale(
  _prev: VehicleSaleFormState,
  formData: FormData,
): Promise<VehicleSaleFormState> {
  const session = await requireActionStaffFinanceAccess().catch(() => null);
  if (!session) return { error: "Only staff or an administrator can confirm a vehicle sale." };
  const parsed = parseSale(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid sale details." };
  const data = parsed.data;
  if (data.type === "EXTERNAL_FINANCE" && session.role !== "ADMIN") {
    return { error: "Only an administrator can confirm an external-finance vehicle sale." };
  }

  const [vehicle, customer, setting] = await Promise.all([
    prisma.consignmentVehicle.findUnique({
      where: { id: data.vehicleId },
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  if (!vehicle || !["AVAILABLE", "RESERVED"].includes(vehicle.status)) {
    return { error: "This vehicle is no longer available." };
  }
  if (!customer) return { error: "Selected customer was not found." };

  const deal = computeVehicleDeal({
    listPrice: toNum(vehicle.listPrice),
    supplierSettlementDue: toNum(vehicle.supplierSettlementDue),
    customerDiscount: data.customerDiscount,
  });
  const allowLoss = session.role === "ADMIN";
  const dealError = validateVehicleDeal(deal, {
    allowLoss,
    lossOverrideReason: data.lossOverrideReason,
  });
  if (dealError) return { error: dealError };
  const paymentError = validateInitialVehiclePayment({
    saleType: data.type,
    customerPrice: deal.customerPrice,
    downPayment: data.downPayment,
    financeApprovedAmount: data.financeApprovedAmount,
  });
  if (paymentError) return { error: paymentError };
  if (data.type === "EXTERNAL_FINANCE" && (!data.financeProvider || !data.financeReference)) {
    return { error: "Finance provider and approval/reference number are required." };
  }

  const interestRate = data.interestRatePerMonth === undefined
    ? toNum(setting?.interestRatePerMonth ?? 0)
    : data.interestRatePerMonth / 100;
  const freeMonths = data.interestFreeMonths ?? setting?.interestFreeMonths ?? 0;
  const initialCollected = data.type === "CASH" ? deal.customerPrice : round2(data.downPayment);
  let saleId = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      saleId = await prisma.$transaction(
        async (tx) => {
          const claimed = await tx.consignmentVehicle.updateMany({
            where: { id: vehicle.id, status: { in: ["AVAILABLE", "RESERVED"] } },
            data: { status: "SOLD" },
          });
          if (claimed.count !== 1) throw new Error("VEHICLE_UNAVAILABLE");

          const sale = await tx.vehicleSale.create({
            data: {
              vehicleId: vehicle.id,
              customerId: data.customerId,
              soldByEmployeeId: data.soldByEmployeeId || null,
              type: data.type,
              saleDate: data.saleDate ? new Date(data.saleDate) : new Date(),
              vehicleLabelSnapshot: `${vehicle.make} ${vehicle.model}${vehicle.year ? ` (${vehicle.year})` : ""}`,
              engineNumberSnapshot: vehicle.engineNumber,
              chassisNumberSnapshot: vehicle.chassisNumber,
              supplierNameSnapshot: vehicle.supplier.name,
              listPrice: deal.listPrice,
              supplierSettlementDue: deal.supplierSettlementDue,
              grossDealerCommission: deal.grossDealerCommission,
              customerDiscount: deal.customerDiscount,
              customerPrice: deal.customerPrice,
              netDealerCommission: deal.netDealerCommission,
              customerCollected: initialCollected,
              lossOverrideReason: deal.netDealerCommission < 0 ? data.lossOverrideReason : null,
              financeProvider: data.type === "EXTERNAL_FINANCE" ? data.financeProvider : null,
              financeReference: data.type === "EXTERNAL_FINANCE" ? data.financeReference : null,
              financeApprovedAmount: data.type === "EXTERNAL_FINANCE" ? data.financeApprovedAmount : null,
              financeApprovedAt: data.type === "EXTERNAL_FINANCE"
                ? data.financeApprovedAt ? new Date(data.financeApprovedAt) : new Date()
                : null,
              notes: data.notes || null,
              createdByUserId: session.id,
              payments: initialCollected > 0 ? {
                create: {
                  kind: data.type === "CASH" ? "FULL_PAYMENT" : "DOWN_PAYMENT",
                  amount: initialCollected,
                  method: data.paymentMethod,
                  reference: data.paymentReference || null,
                  note: data.type === "CASH" ? "Full cash sale payment" : "Down payment",
                  recordedByUserId: session.id,
                },
              } : undefined,
              creditAgreement: data.type === "IN_HOUSE_CREDIT" ? {
                create: {
                  principal: round2(deal.customerPrice - initialCollected),
                  startDate: data.saleDate ? new Date(data.saleDate) : new Date(),
                  firstDueDate: data.firstDueDate ? new Date(data.firstDueDate) : null,
                  termMonths: data.termMonths ?? null,
                  expectedInstallment: data.expectedInstallment ?? null,
                  interestRatePerMonth: interestRate,
                  interestFreeMonths: freeMonths,
                  guarantorName: data.guarantorName || null,
                  guarantorNic: data.guarantorNic || null,
                  guarantorPhone: data.guarantorPhone || null,
                },
              } : undefined,
              documentCase: {
                create: {
                  events: {
                    create: {
                      type: "CASE_CREATED",
                      toStatus: "AWAITING_CUSTOMER_DOCUMENTS",
                      note: "Registration document case opened with the vehicle sale.",
                      createdByUserId: session.id,
                    },
                  },
                  items: {
                    create: [
                      { name: "Customer NIC copy" },
                      { name: "Proof of address" },
                      { name: "Signed registration application" },
                      ...(data.type === "EXTERNAL_FINANCE" ? [{ name: "Finance approval documents" }] : []),
                    ],
                  },
                },
              },
            },
          });
          return sale.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 },
      );
      break;
    } catch (error) {
      if (error instanceof Error && error.message === "VEHICLE_UNAVAILABLE") {
        return { error: "Another user has already sold or reserved this vehicle." };
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code) &&
        attempt < 2
      ) continue;
      console.error("createVehicleSale failed", error);
      return { error: "Could not complete the vehicle sale. Please try again." };
    }
  }
  if (!saleId) return { error: "Could not complete the vehicle sale. Please try again." };
  revalidatePath("/vehicles");
  revalidatePath("/vehicle-sales");
  redirect(`/vehicle-sales/${saleId}?new=1`);
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter a valid payment amount"),
  method: z.enum(METHODS),
  paidDate: z.string().optional(),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

function parsePayment(formData: FormData) {
  return paymentSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method") || "CASH",
    paidDate: formData.get("paidDate") || undefined,
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
  });
}

export async function recordVehicleCustomerPayment(
  saleId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionStaffFinanceAccess().catch(() => null);
  if (!session) return { error: "You do not have permission to record vehicle installments." };
  const parsed = parsePayment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid payment." };
  const data = parsed.data;
  const paidDate = data.paidDate ? new Date(data.paidDate) : new Date();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const sale = await tx.vehicleSale.findUnique({
          where: { id: saleId },
          include: { creditAgreement: true, payments: { orderBy: { paidDate: "asc" } } },
        });
        if (!sale || sale.status === "VOIDED") return { error: "Vehicle sale not found or voided." };
        if (sale.type !== "IN_HOUSE_CREDIT" || !sale.creditAgreement) {
          return { error: "Only an in-house credit sale can receive installments." };
        }
        if (sale.creditAgreement.status !== "ACTIVE") return { error: "This credit account is not active." };

        const now = new Date();
        const duplicate = sale.payments.some((payment) =>
          payment.createdAt.getTime() >= now.getTime() - 30_000 &&
          toNum(payment.amount) === round2(data.amount) &&
          payment.method === data.method &&
          (payment.reference ?? "") === (data.reference ?? "") &&
          payment.recordedByUserId === session.id,
        );
        if (duplicate) return { error: "This payment appears to have already been recorded." };

        const installmentPayments = sale.payments
          .filter((payment) => payment.kind === "INSTALLMENT" || payment.kind === "FINAL_SETTLEMENT")
          .map((payment) => ({ amount: toNum(payment.amount), paidDate: payment.paidDate }));
        const terms = {
          principal: toNum(sale.creditAgreement.principal),
          startDate: sale.creditAgreement.startDate,
          interestRatePerMonth: toNum(sale.creditAgreement.interestRatePerMonth),
          interestFreeMonths: sale.creditAgreement.interestFreeMonths,
        };
        const state = computeCreditState(terms, installmentPayments, paidDate);
        if (round2(data.amount) > round2(state.outstanding)) {
          return { error: `Payment exceeds the current balance of LKR ${state.outstanding.toFixed(2)}.` };
        }
        const after = computeCreditState(
          terms,
          [...installmentPayments, { amount: data.amount, paidDate }],
          paidDate,
        );
        await tx.vehicleCustomerPayment.create({
          data: {
            saleId,
            kind: after.isSettled ? "FINAL_SETTLEMENT" : "INSTALLMENT",
            amount: data.amount,
            method: data.method,
            paidDate,
            reference: data.reference || null,
            note: data.note || null,
            recordedByUserId: session.id,
          },
        });
        await tx.vehicleSale.update({
          where: { id: saleId },
          data: { customerCollected: { increment: data.amount } },
        });
        if (after.isSettled) {
          await tx.vehicleCreditAgreement.update({ where: { id: sale.creditAgreement.id }, data: { status: "SETTLED" } });
        }
        return { ok: true as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      if ("error" in result) return result;
      revalidateSale(saleId);
      return { ok: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      console.error("recordVehicleCustomerPayment failed", error);
      return { error: "Could not record the payment. Please try again." };
    }
  }
  return { error: "The account changed at the same time. Please try again." };
}

export async function recordVehicleSupplierSettlement(
  saleId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionAdmin().catch(() => null);
  if (!session) return { error: "Only an administrator can pay vehicle suppliers." };
  const parsed = parsePayment(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settlement." };
  const data = parsed.data;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const sale = await tx.vehicleSale.findUnique({
          where: { id: saleId },
          include: { vehicle: { select: { supplierId: true } }, supplierSettlements: true },
        });
        if (!sale || sale.status === "VOIDED") return { error: "Vehicle sale not found or voided." };
        const outstanding = round2(toNum(sale.supplierSettlementDue) - toNum(sale.supplierPaid));
        if (round2(data.amount) > outstanding) {
          return { error: `Settlement exceeds the supplier balance of LKR ${outstanding.toFixed(2)}.` };
        }
        const now = new Date();
        const duplicate = sale.supplierSettlements.some((payment) =>
          payment.createdAt.getTime() >= now.getTime() - 30_000 &&
          toNum(payment.amount) === round2(data.amount) &&
          payment.method === data.method &&
          (payment.reference ?? "") === (data.reference ?? "") &&
          payment.recordedByUserId === session.id,
        );
        if (duplicate) return { error: "This supplier settlement appears to have already been recorded." };
        await tx.vehicleSupplierSettlement.create({
          data: {
            saleId,
            supplierId: sale.vehicle.supplierId,
            amount: data.amount,
            method: data.method,
            paidDate: data.paidDate ? new Date(data.paidDate) : new Date(),
            reference: data.reference || null,
            note: data.note || null,
            recordedByUserId: session.id,
          },
        });
        await tx.vehicleSale.update({ where: { id: saleId }, data: { supplierPaid: { increment: data.amount } } });
        return { ok: true as const };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
      if ("error" in result) return result;
      revalidateSale(saleId);
      return { ok: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      console.error("recordVehicleSupplierSettlement failed", error);
      return { error: "Could not record the supplier settlement. Please try again." };
    }
  }
  return { error: "The supplier balance changed at the same time. Please try again." };
}

const documentItemSchema = z.object({
  name: z.string().trim().min(1, "Document name is required"),
  status: z.enum(["REQUIRED", "RECEIVED", "SUBMITTED", "APPROVED", "RETURNED", "WAIVED"]).default("REQUIRED"),
  required: z.boolean().default(true),
  fileKey: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  waiverReason: z.string().trim().optional(),
});

function parseDocumentItem(formData: FormData) {
  return documentItemSchema.safeParse({
    name: formData.get("name"),
    status: formData.get("status") || "REQUIRED",
    required: formData.get("required") !== "false",
    fileKey: formData.get("fileKey") || undefined,
    reference: formData.get("reference") || undefined,
    waiverReason: formData.get("waiverReason") || undefined,
  });
}

export async function addVehicleDocumentItem(
  caseId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionUser().catch(() => null);
  if (!session) return { error: "Your session has expired." };
  const parsed = parseDocumentItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid document." };
  try {
    const item = await prisma.vehicleDocumentItem.create({
      data: { caseId, ...documentItemData(parsed.data, session.id) },
      select: { case: { select: { saleId: true } } },
    });
    await prisma.vehicleDocumentEvent.create({
      data: { caseId, type: "DOCUMENT_ADDED", note: parsed.data.name, createdByUserId: session.id },
    });
    revalidateSale(item.case.saleId);
    return { ok: true };
  } catch (error) {
    console.error("addVehicleDocumentItem failed", error);
    return { error: "Could not add the document." };
  }
}

function documentItemData(
  data: z.infer<typeof documentItemSchema>,
  userId: string,
) {
  const now = new Date();
  return {
    name: data.name,
    status: data.status,
    required: data.required,
    fileKey: data.fileKey || null,
    reference: data.reference || null,
    waiverReason: data.status === "WAIVED" ? data.waiverReason || null : null,
    receivedAt: ["RECEIVED", "SUBMITTED", "APPROVED", "RETURNED"].includes(data.status) ? now : null,
    submittedAt: ["SUBMITTED", "APPROVED", "RETURNED"].includes(data.status) ? now : null,
    returnedAt: data.status === "RETURNED" ? now : null,
    updatedByUserId: userId,
  };
}

export async function updateVehicleDocumentItem(
  itemId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionUser().catch(() => null);
  if (!session) return { error: "Your session has expired." };
  const parsed = parseDocumentItem(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid document." };
  if (session.role === "SALESPERSON" && !["REQUIRED", "RECEIVED"].includes(parsed.data.status)) {
    return { error: "Only staff can submit, approve, waive, or return registration documents." };
  }
  if (parsed.data.status === "WAIVED" && !parsed.data.waiverReason) return { error: "Enter a waiver reason." };
  try {
    const current = await prisma.vehicleDocumentItem.findUnique({
      where: { id: itemId },
      include: { case: { select: { saleId: true, status: true } } },
    });
    if (!current) return { error: "Document not found." };
    if (["HANDED_OVER", "CANCELLED"].includes(current.case.status)) return { error: "This document case is closed." };
    await prisma.vehicleDocumentItem.update({
      where: { id: itemId },
      data: documentItemData(parsed.data, session.id),
    });
    revalidateSale(current.case.saleId);
    return { ok: true };
  } catch (error) {
    console.error("updateVehicleDocumentItem failed", error);
    return { error: "Could not update the document." };
  }
}

const caseSchema = z.object({
  status: z.enum(["AWAITING_CUSTOMER_DOCUMENTS", "DOCUMENTS_RECEIVED", "SUBMITTED", "PROCESSING", "REGISTERED", "HANDED_OVER", "CANCELLED"]),
  registrationNumber: z.string().trim().optional(),
  processingReference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function updateVehicleDocumentCase(
  caseId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionStaffFinanceAccess().catch(() => null);
  if (!session) return { error: "You do not have permission to update registration processing." };
  const parsed = caseSchema.safeParse({
    status: formData.get("status"),
    registrationNumber: formData.get("registrationNumber") || undefined,
    processingReference: formData.get("processingReference") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid document status." };
  const data = parsed.data;
  try {
    const current = await prisma.vehicleDocumentCase.findUnique({ where: { id: caseId }, select: { status: true, saleId: true } });
    if (!current) return { error: "Document case not found." };
    if (data.status === "CANCELLED" && session.role !== "ADMIN") {
      return { error: "Only an administrator can cancel a document case." };
    }
    if (["DOCUMENTS_RECEIVED", "HANDED_OVER"].includes(data.status)) {
      return { error: "This stage requires the customer's signed acknowledgement." };
    }
    if (!canTransitionVehicleDocuments(current.status, data.status)) return { error: "That document status change is not allowed." };
    if (data.status === "REGISTERED" && !data.registrationNumber) return { error: "Registration number is required." };
    await prisma.$transaction([
      prisma.vehicleDocumentCase.update({
        where: { id: caseId },
        data: {
          status: data.status,
          registrationNumber: data.registrationNumber || undefined,
          processingReference: data.processingReference || undefined,
          notes: data.notes || undefined,
          submittedAt: data.status === "SUBMITTED" ? new Date() : undefined,
          registeredAt: data.status === "REGISTERED" ? new Date() : undefined,
        },
      }),
      prisma.vehicleDocumentEvent.create({
        data: {
          caseId,
          type: "STATUS_CHANGED",
          fromStatus: current.status,
          toStatus: data.status,
          note: data.notes || null,
          createdByUserId: session.id,
        },
      }),
    ]);
    revalidateSale(current.saleId);
    return { ok: true };
  } catch (error) {
    console.error("updateVehicleDocumentCase failed", error);
    return { error: "Could not update the document case." };
  }
}

const acknowledgementSchema = z.object({
  signerName: z.string().trim().min(1, "Customer name is required"),
  signerNic: z.string().trim().min(1, "Customer NIC is required"),
  signatureKey: z.string().trim().min(1, "Customer signature is required"),
});

export async function captureVehicleAcknowledgement(
  caseId: string,
  type: VehicleAcknowledgementType,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const session = await requireActionUser().catch(() => null);
  if (!session) return { error: "Your session has expired." };
  const parsed = acknowledgementSchema.safeParse({
    signerName: formData.get("signerName"),
    signerNic: formData.get("signerNic"),
    signatureKey: formData.get("signatureKey"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Signature details are incomplete." };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const documentCase = await tx.vehicleDocumentCase.findUnique({
        where: { id: caseId },
        include: { items: { orderBy: { createdAt: "asc" } }, sale: { select: { id: true, vehicleLabelSnapshot: true } } },
      });
      if (!documentCase) return { error: "Document case not found." };
      if (type === "CUSTOMER_DOCUMENTS_RECEIVED" && documentCase.status !== "AWAITING_CUSTOMER_DOCUMENTS") {
        return { error: "Customer documents have already been acknowledged or the case has moved on." };
      }
      if (type === "REGISTRATION_DOCUMENTS_HANDED_OVER" && documentCase.status !== "REGISTERED") {
        return { error: "Registration must be completed before handing documents to the customer." };
      }
      const manifest = documentCase.items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        required: item.required,
        reference: item.reference ?? "",
        fileKey: item.fileKey ?? "",
      }));
      if (type === "CUSTOMER_DOCUMENTS_RECEIVED") {
        const receivedCount = documentCase.items.filter((item) => item.status !== "REQUIRED").length;
        if (receivedCount === 0) return { error: "Mark at least one customer document as received before signing." };
      } else {
        const incomplete = documentCase.items.some((item) => item.required && !["APPROVED", "RETURNED", "WAIVED"].includes(item.status));
        if (incomplete) return { error: "All required documents must be approved, returned, or waived before handover." };
      }
      const manifestJson = JSON.stringify(manifest);
      const acknowledgementText = type === "CUSTOMER_DOCUMENTS_RECEIVED"
        ? `I confirm that the documents listed here were handed to Madagama for processing for ${documentCase.sale.vehicleLabelSnapshot}.`
        : `I confirm that the completed registration documents listed here were handed back to me for ${documentCase.sale.vehicleLabelSnapshot}.`;
      const nextStatus: VehicleDocumentCaseStatus = type === "CUSTOMER_DOCUMENTS_RECEIVED" ? "DOCUMENTS_RECEIVED" : "HANDED_OVER";
      await tx.vehicleDocumentAcknowledgement.create({
        data: {
          caseId,
          type,
          signerName: parsed.data.signerName,
          signerNic: parsed.data.signerNic.toUpperCase(),
          signatureKey: parsed.data.signatureKey,
          acknowledgementText,
          documentManifest: manifest,
          manifestHash: crypto.createHash("sha256").update(manifestJson).digest("hex"),
          witnessedByUserId: session.id,
        },
      });
      await tx.vehicleDocumentCase.update({
        where: { id: caseId },
        data: { status: nextStatus, handedOverAt: nextStatus === "HANDED_OVER" ? new Date() : undefined },
      });
      if (nextStatus === "HANDED_OVER") {
        await tx.vehicleDocumentItem.updateMany({
          where: { caseId, status: "APPROVED" },
          data: { status: "RETURNED", returnedAt: new Date(), updatedByUserId: session.id },
        });
      }
      await tx.vehicleDocumentEvent.create({
        data: {
          caseId,
          type,
          fromStatus: documentCase.status,
          toStatus: nextStatus,
          note: acknowledgementText,
          createdByUserId: session.id,
        },
      });
      return { ok: true as const, saleId: documentCase.sale.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 });
    if ("error" in result) return result;
    revalidateSale(result.saleId);
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "This acknowledgement has already been signed." };
    }
    console.error("captureVehicleAcknowledgement failed", error);
    return { error: "Could not save the signed acknowledgement." };
  }
}

export async function voidVehicleSale(
  saleId: string,
  _prev: VehicleActionState,
  formData: FormData,
): Promise<VehicleActionState> {
  const admin = await requireActionAdmin().catch(() => null);
  if (!admin) return { error: "Only an administrator can void a vehicle sale." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Enter a reason for voiding the sale." };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.vehicleSale.findUnique({
        where: { id: saleId },
        include: {
          payments: true,
          supplierSettlements: true,
          creditAgreement: true,
          documentCase: { include: { acknowledgements: true } },
        },
      });
      if (!sale || sale.status === "VOIDED") return { error: "Sale not found or already voided." };
      if (sale.payments.length || sale.supplierSettlements.length || sale.documentCase?.acknowledgements.length) {
        return { error: "Reverse all payments and signed custody events before voiding this sale." };
      }
      await tx.vehicleSale.update({
        where: { id: saleId },
        data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason, voidedByUserId: admin.id },
      });
      await tx.consignmentVehicle.update({ where: { id: sale.vehicleId }, data: { status: "AVAILABLE" } });
      if (sale.creditAgreement) {
        await tx.vehicleCreditAgreement.update({ where: { id: sale.creditAgreement.id }, data: { status: "VOIDED" } });
      }
      return { ok: true as const };
    });
    if ("error" in result) return result;
    revalidateSale(saleId);
    revalidatePath("/vehicles");
    return { ok: true };
  } catch (error) {
    console.error("voidVehicleSale failed", error);
    return { error: "Could not void the vehicle sale." };
  }
}

function revalidateSale(saleId: string) {
  revalidatePath(`/vehicle-sales/${saleId}`);
  revalidatePath(`/vehicle-sales/${saleId}/documents`);
  revalidatePath("/vehicle-sales");
  revalidatePath("/vehicles");
  revalidatePath("/reports");
}
