"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computePayroll, selectAdvancesToRecover } from "@/lib/payroll";
import { round2, toNum } from "@/lib/utils";

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

      // Idempotent regeneration: release any advances this run previously
      // recovered so they're considered OUTSTANDING again, then re-apply below.
      await tx.salaryAdvance.updateMany({
        where: { recoveredRunId: id },
        data: { status: "OUTSTANDING", recoveredRunId: null, recoveredAt: null },
      });

      // Authoritative advance recovery, computed in-transaction (computePayroll's
      // advance number above is only a preview and can be stale on regeneration).
      const outstanding = await tx.salaryAdvance.findMany({
        where: { status: "OUTSTANDING" },
        orderBy: { date: "asc" },
      });
      const byEmployee = new Map<string, { id: string; amount: number }[]>();
      for (const adv of outstanding) {
        const list = byEmployee.get(adv.employeeId) ?? [];
        list.push({ id: adv.id, amount: toNum(adv.amount) });
        byEmployee.set(adv.employeeId, list);
      }

      const now = new Date();
      const data = [];
      for (const l of lines) {
        const capacity = round2(l.grossPay - l.epfEmployee);
        const { deducted, ids } = selectAdvancesToRecover(byEmployee.get(l.employeeId) ?? [], capacity);
        if (ids.length) {
          await tx.salaryAdvance.updateMany({
            where: { id: { in: ids } },
            data: { status: "RECOVERED", recoveredRunId: id, recoveredAt: now },
          });
        }
        const deductions = round2(l.epfEmployee + deducted);
        data.push({
          runId: id,
          employeeId: l.employeeId,
          daysWorked: l.daysWorked,
          dailyRate: l.dailyRate,
          baseSalary: l.baseSalary,
          overtimeTotal: l.overtimeTotal,
          commissionsTotal: l.commissionsTotal,
          epfEmployee: l.epfEmployee,
          epfEmployer: l.epfEmployer,
          etf: l.etf,
          advanceDeduction: deducted,
          deductions,
          netPay: round2(l.grossPay - deductions),
        });
      }
      await tx.payrollLine.createMany({ data });
      return id;
    },
    { timeout: 20000 },
  );

  revalidatePath("/payroll");
  redirect(`/payroll/${runId}`);
}
