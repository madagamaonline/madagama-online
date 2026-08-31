"use server";

import { CashDrawerMovementType, CashDrawerShiftStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActionStaffFinanceAccess } from "@/lib/auth";
import {
  CASH_DENOMINATIONS,
  denominationTotal,
  expectedDrawerCash,
  type CashActivity,
  type DenominationCounts,
} from "@/lib/cash-drawer";
import { round2 } from "@/lib/utils";

export type ShiftSummary = CashActivity & {
  shiftId: string;
  startTime: Date;
  openingCash: number;
  expectedCash: number;
  openedByName: string;
  movements: Array<{
    id: string;
    type: CashDrawerMovementType;
    amount: number;
    reason: string;
    createdAt: Date;
    operatorName: string;
  }>;
};

const moneyWindow = (startTime: Date, endTime: Date) => ({ gte: startTime, lte: endTime });

async function calculateCashActivity(
  tx: Prisma.TransactionClient,
  shiftId: string,
  startTime: Date,
  endTime: Date,
): Promise<CashActivity> {
  const [cashInvoices, cashPayments, openAccountCashPayments, layawayCashPayments, cashRefunds, movementTotals] =
    await Promise.all([
      tx.invoice.aggregate({
        where: { type: "CASH", voidedAt: null, createdAt: moneyWindow(startTime, endTime) },
        _sum: { grandTotal: true },
      }),
      tx.payment.aggregate({
        where: {
          method: "CASH",
          agreement: { status: { not: "VOIDED" }, invoice: { voidedAt: null } },
          createdAt: moneyWindow(startTime, endTime),
        },
        _sum: { amount: true },
      }),
      tx.openAccountPayment.aggregate({
        where: {
          method: "CASH",
          account: { status: { not: "VOIDED" }, invoice: { voidedAt: null } },
          createdAt: moneyWindow(startTime, endTime),
        },
        _sum: { amount: true },
      }),
      tx.layawayPayment.aggregate({
        where: { method: "CASH", paidDate: moneyWindow(startTime, endTime) },
        _sum: { amount: true },
      }),
      tx.salesReturn.aggregate({
        where: { method: "CASH", createdAt: moneyWindow(startTime, endTime) },
        _sum: { totalRefund: true },
      }),
      tx.cashDrawerMovement.groupBy({
        by: ["type"],
        where: { shiftId, createdAt: moneyWindow(startTime, endTime) },
        _sum: { amount: true },
      }),
    ]);

  const movementAmount = (type: CashDrawerMovementType) =>
    Number(movementTotals.find((row) => row.type === type)?._sum.amount ?? 0);

  return {
    totalCashSales: Number(cashInvoices._sum.grandTotal ?? 0),
    totalRepayments: Number(cashPayments._sum.amount ?? 0),
    totalOpenAccountCollections: Number(openAccountCashPayments._sum.amount ?? 0),
    totalLayawayCollections: Number(layawayCashPayments._sum.amount ?? 0),
    totalCashRefunds: Number(cashRefunds._sum.totalRefund ?? 0),
    totalCashAdditions: movementAmount(CashDrawerMovementType.ADDITION),
    totalCashWithdrawals: movementAmount(CashDrawerMovementType.WITHDRAWAL),
  };
}

export async function getCurrentShiftSummary(): Promise<ShiftSummary | null> {
  await requireActionStaffFinanceAccess();

  return prisma.$transaction(async (tx) => {
    const activeShift = await tx.cashDrawerShift.findFirst({
      where: { status: CashDrawerShiftStatus.OPEN },
      include: {
        openedBy: { select: { name: true } },
        movements: {
          include: { createdBy: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!activeShift) return null;

    const activity = await calculateCashActivity(tx, activeShift.id, activeShift.openedAt, new Date());
    const openingCash = Number(activeShift.openingCash);

    return {
      shiftId: activeShift.id,
      startTime: activeShift.openedAt,
      openingCash,
      expectedCash: round2(expectedDrawerCash(openingCash, activity)),
      openedByName: activeShift.openedBy.name,
      ...activity,
      movements: activeShift.movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: Number(movement.amount),
        reason: movement.reason,
        createdAt: movement.createdAt,
        operatorName: movement.createdBy.name,
      })),
    };
  });
}

const countSchema = z.coerce.number().int().min(0).max(1_000_000);
const denominationSchema = z.object({
  n5000: countSchema,
  n2000: countSchema,
  n1000: countSchema,
  n500: countSchema,
  n100: countSchema,
  n50: countSchema,
  n20: countSchema,
  looseCoins: z.coerce.number().int().min(0).max(100_000_000),
});

function denominationInput(formData: FormData) {
  return {
    ...Object.fromEntries(CASH_DENOMINATIONS.map(({ key }) => [key, formData.get(key) || "0"])),
    looseCoins: formData.get("looseCoins") || "0",
  };
}

export type ShiftReportFormState = { error?: string; ok?: boolean };

export async function openCashDrawerShift(
  _prev: ShiftReportFormState,
  formData: FormData,
): Promise<ShiftReportFormState> {
  let session;
  try {
    session = await requireActionStaffFinanceAccess();
  } catch {
    return { error: "You don't have access to shift reports." };
  }

  const parsed = denominationSchema.safeParse(denominationInput(formData));
  if (!parsed.success) return { error: "Enter valid, non-negative denomination counts." };

  const counts = parsed.data as DenominationCounts;
  const openingCash = denominationTotal(counts);
  if (openingCash > 9_000_000_000) return { error: "Opening cash total is too large." };

  try {
    await prisma.cashDrawerShift.create({
      data: { openingCash, openingDenominations: counts, openedByUserId: session.id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A cash drawer shift is already open. Refresh the page to continue it." };
    }
    console.error("Failed to open cash drawer shift", error);
    return { error: "Failed to open the cash drawer shift." };
  }

  revalidatePath("/shift-report");
  redirect("/shift-report");
}

const movementSchema = z.object({
  shiftId: z.string().min(1),
  type: z.nativeEnum(CashDrawerMovementType),
  amount: z.coerce.number().positive("Enter an amount greater than zero.").max(9_000_000_000),
  reason: z.string().trim().min(3, "Enter a reason.").max(500),
});

export async function recordCashDrawerMovement(
  _prev: ShiftReportFormState,
  formData: FormData,
): Promise<ShiftReportFormState> {
  let session;
  try {
    session = await requireActionStaffFinanceAccess();
  } catch {
    return { error: "You don't have access to shift reports." };
  }

  const parsed = movementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid cash movement." };

  try {
    await prisma.$transaction(async (tx) => {
      const shift = await tx.cashDrawerShift.findFirst({
        where: { id: parsed.data.shiftId, status: CashDrawerShiftStatus.OPEN },
        select: { id: true },
      });
      if (!shift) throw new Error("SHIFT_CLOSED");
      await tx.cashDrawerMovement.create({
        data: {
          shiftId: shift.id,
          type: parsed.data.type,
          amount: round2(parsed.data.amount),
          reason: parsed.data.reason,
          createdByUserId: session.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SHIFT_CLOSED") {
      return { error: "This shift is no longer open. Refresh the page." };
    }
    console.error("Failed to record cash drawer movement", error);
    return { error: "Failed to record the cash movement." };
  }

  revalidatePath("/shift-report");
  return { ok: true };
}

const closeShiftSchema = denominationSchema.extend({
  shiftId: z.string().min(1),
  notes: z.string().trim().max(2000).optional(),
});

export async function createShiftReport(
  _prev: ShiftReportFormState,
  formData: FormData,
): Promise<ShiftReportFormState> {
  let session;
  try {
    session = await requireActionStaffFinanceAccess();
  } catch {
    return { error: "You don't have access to shift reports." };
  }

  const parsed = closeShiftSchema.safeParse({
    ...denominationInput(formData),
    shiftId: formData.get("shiftId"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid shift report data." };

  const { shiftId, notes, ...rawCounts } = parsed.data;
  const counts = rawCounts as DenominationCounts;
  const actualCash = denominationTotal(counts);
  if (actualCash > 9_000_000_000) return { error: "Closing cash total is too large." };

  try {
    await prisma.$transaction(
      async (tx) => {
        const shift = await tx.cashDrawerShift.findFirst({
          where: { id: shiftId, status: CashDrawerShiftStatus.OPEN },
          select: { id: true, openedAt: true, openingCash: true },
        });
        if (!shift) throw new Error("SHIFT_CLOSED");

        const endTime = new Date();
        const activity = await calculateCashActivity(tx, shift.id, shift.openedAt, endTime);
        const expectedCash = round2(expectedDrawerCash(Number(shift.openingCash), activity));
        const discrepancy = round2(actualCash - expectedCash);

        const claimed = await tx.cashDrawerShift.updateMany({
          where: { id: shift.id, status: CashDrawerShiftStatus.OPEN },
          data: {
            status: CashDrawerShiftStatus.CLOSED,
            closedAt: endTime,
            closingCash: actualCash,
            closingDenominations: counts,
            expectedCash,
            discrepancy,
            closingNotes: notes || null,
            closedByUserId: session.id,
          },
        });
        if (claimed.count !== 1) throw new Error("SHIFT_CLOSED");

        const report = await tx.shiftReport.create({
          data: {
            createdByUserId: session.id,
            startTime: shift.openedAt,
            endTime,
            expectedCash,
            actualCash,
            discrepancy,
            notes: notes || null,
          },
        });
        await tx.cashDrawerShift.update({ where: { id: shift.id }, data: { shiftReportId: report.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SHIFT_CLOSED") {
      return { error: "This shift has already been closed. Refresh the page." };
    }
    console.error("Failed to save shift report", error);
    return { error: "Failed to close the shift. No partial report was saved." };
  }

  revalidatePath("/shift-report");
  revalidatePath("/dashboard");
  redirect("/shift-report");
}

export type ShiftReportRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  openingCash: number | null;
  expectedCash: number;
  actualCash: number;
  discrepancy: number;
  notes: string | null;
  createdAt: Date;
  operatorName: string;
  openedByName: string | null;
};

export async function getShiftReports(): Promise<ShiftReportRow[]> {
  await requireActionStaffFinanceAccess();
  const reports = await prisma.shiftReport.findMany({
    include: {
      createdBy: { select: { name: true } },
      employee: { select: { name: true } },
      cashDrawerShift: { select: { openingCash: true, openedBy: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reports.map((report) => ({
    id: report.id,
    startTime: report.startTime,
    endTime: report.endTime,
    openingCash: report.cashDrawerShift ? Number(report.cashDrawerShift.openingCash) : null,
    expectedCash: Number(report.expectedCash),
    actualCash: Number(report.actualCash),
    discrepancy: Number(report.discrepancy),
    notes: report.notes,
    createdAt: report.createdAt,
    operatorName: report.createdBy?.name ?? report.employee?.name ?? "—",
    openedByName: report.cashDrawerShift?.openedBy.name ?? null,
  }));
}
