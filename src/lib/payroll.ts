import "server-only";
import { prisma } from "./prisma";
import { toNum, round2 } from "./utils";

export type AttendanceDay = { date: Date; status: string };

export type PayrollLineData = {
  employeeId: string;
  name: string;
  daysWorked: number;
  fullDays: number;
  halfDays: number;
  absentDays: number;
  dailyRate: number;
  baseSalary: number;
  commissionsTotal: number;
  netPay: number;
  dates: AttendanceDay[];
};

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** Computes salary lines for a month (YYYY-MM) from attendance + commissions. */
export async function computePayroll(month: string): Promise<PayrollLineData[]> {
  const { start, end } = monthRange(month);
  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const [attendance, commissions] = await Promise.all([
    prisma.attendance.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.commission.findMany({ where: { date: { gte: start, lt: end } } }),
  ]);

  const days = new Map<string, number>();
  const fulls = new Map<string, number>();
  const halves = new Map<string, number>();
  const absents = new Map<string, number>();
  const datesByEmployee = new Map<string, AttendanceDay[]>();
  for (const a of attendance) {
    const v = a.status === "PRESENT" ? 1 : a.status === "HALF_DAY" ? 0.5 : 0;
    days.set(a.employeeId, (days.get(a.employeeId) ?? 0) + v);
    if (a.status === "PRESENT") fulls.set(a.employeeId, (fulls.get(a.employeeId) ?? 0) + 1);
    else if (a.status === "HALF_DAY") halves.set(a.employeeId, (halves.get(a.employeeId) ?? 0) + 1);
    else absents.set(a.employeeId, (absents.get(a.employeeId) ?? 0) + 1);
    // Record every marked day so the payroll page can show exactly which dates
    // were full, half, or absent.
    const list = datesByEmployee.get(a.employeeId) ?? [];
    list.push({ date: a.date, status: a.status });
    datesByEmployee.set(a.employeeId, list);
  }
  for (const list of datesByEmployee.values()) {
    list.sort((x, y) => x.date.getTime() - y.date.getTime());
  }
  const comm = new Map<string, number>();
  for (const c of commissions) {
    comm.set(c.employeeId, (comm.get(c.employeeId) ?? 0) + toNum(c.amount));
  }

  return employees.map((e) => {
    const daysWorked = days.get(e.id) ?? 0;
    const dailyRate = toNum(e.dailyRate);
    const baseSalary = round2(daysWorked * dailyRate);
    const commissionsTotal = round2(comm.get(e.id) ?? 0);
    return {
      employeeId: e.id,
      name: e.name,
      daysWorked,
      fullDays: fulls.get(e.id) ?? 0,
      halfDays: halves.get(e.id) ?? 0,
      absentDays: absents.get(e.id) ?? 0,
      dailyRate,
      baseSalary,
      commissionsTotal,
      netPay: round2(baseSalary + commissionsTotal),
      dates: datesByEmployee.get(e.id) ?? [],
    };
  });
}
