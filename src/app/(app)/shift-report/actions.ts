"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type ShiftSummary = {
  startTime: Date;
  expectedCash: number;
  totalCashSales: number;
  totalRepayments: number;
};

export async function getCurrentShiftSummary(): Promise<ShiftSummary> {
  // Find the last shift report to determine the start time of the current shift
  const lastReport = await prisma.shiftReport.findFirst({
    orderBy: { endTime: "desc" },
  });

  // Default to today's start if no shift reports exist
  const startTime = lastReport ? lastReport.endTime : new Date(new Date().setHours(0, 0, 0, 0));

  // Query all cash invoices since the start time
  const cashInvoices = await prisma.invoice.findMany({
    where: {
      type: "CASH",
      createdAt: {
        gte: startTime,
      },
    },
    select: {
      grandTotal: true,
    },
  });

  // Query all cash repayments since the start time
  const cashPayments = await prisma.payment.findMany({
    where: {
      method: "CASH",
      createdAt: {
        gte: startTime,
      },
    },
    select: {
      amount: true,
    },
  });

  const totalCashSales = cashInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
  const totalRepayments = cashPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const expectedCash = totalCashSales + totalRepayments;

  return {
    startTime,
    expectedCash,
    totalCashSales,
    totalRepayments,
  };
}

const shiftReportSchema = z.object({
  expectedCash: z.coerce.number(),
  actualCash: z.coerce.number().min(0, "Actual cash must be positive"),
  discrepancy: z.coerce.number(),
  notes: z.string().optional(),
});

export type ShiftReportFormState = { error?: string; ok?: boolean };

export async function createShiftReport(
  startTime: Date,
  _prev: ShiftReportFormState,
  formData: FormData,
): Promise<ShiftReportFormState> {
  const parsed = shiftReportSchema.safeParse({
    expectedCash: formData.get("expectedCash"),
    actualCash: formData.get("actualCash"),
    discrepancy: formData.get("discrepancy"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid shift report data" };
  }

  const data = parsed.data;
  const session = await getSession();

  try {
    await prisma.shiftReport.create({
      data: {
        createdByUserId: session?.id ?? null,
        startTime,
        endTime: new Date(),
        expectedCash: data.expectedCash,
        actualCash: data.actualCash,
        discrepancy: data.discrepancy,
        notes: data.notes?.trim() || null,
      },
    });
  } catch (error) {
    console.error("Failed to save shift report", error);
    return { error: "Failed to save shift report to the database." };
  }

  revalidatePath("/shift-report");
  revalidatePath("/dashboard");
  redirect("/shift-report");
}

export type ShiftReportRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  expectedCash: number;
  actualCash: number;
  discrepancy: number;
  notes: string | null;
  createdAt: Date;
  operatorName: string;
};

export async function getShiftReports(): Promise<ShiftReportRow[]> {
  const reports = await prisma.shiftReport.findMany({
    include: {
      createdBy: { select: { name: true } },
      employee: { select: { name: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return reports.map((r) => ({
    id: r.id,
    startTime: r.startTime,
    endTime: r.endTime,
    expectedCash: Number(r.expectedCash),
    actualCash: Number(r.actualCash),
    discrepancy: Number(r.discrepancy),
    notes: r.notes,
    createdAt: r.createdAt,
    operatorName: r.createdBy?.name ?? r.employee?.name ?? "—",
  }));
}
