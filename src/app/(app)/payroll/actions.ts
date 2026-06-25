"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";

export async function generatePayroll(month: string): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const lines = await computePayroll(month);

  const runId = await prisma.$transaction(
    async (tx) => {
      const existing = await tx.payrollRun.findUnique({ where: { period: month } });
      let id: string;
      if (existing) {
        await tx.payrollLine.deleteMany({ where: { runId: existing.id } });
        await tx.payrollRun.update({ where: { id: existing.id }, data: { generatedAt: new Date() } });
        id = existing.id;
      } else {
        const run = await tx.payrollRun.create({ data: { period: month } });
        id = run.id;
      }
      await tx.payrollLine.createMany({
        data: lines.map((l) => ({
          runId: id,
          employeeId: l.employeeId,
          daysWorked: l.daysWorked,
          dailyRate: l.dailyRate,
          baseSalary: l.baseSalary,
          commissionsTotal: l.commissionsTotal,
          deductions: 0,
          netPay: l.netPay,
        })),
      });
      return id;
    },
    { timeout: 20000 },
  );

  revalidatePath("/payroll");
  redirect(`/payroll/${runId}`);
}
