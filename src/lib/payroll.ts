import "server-only";
import { prisma } from "./prisma";
import { toNum } from "./utils";
import { computePayLine, type PayRates } from "./payroll-math";

export { selectAdvancesToRecover, computePayLine } from "./payroll-math";
export type { PayRates, PayLine, PayLineInput } from "./payroll-math";

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
  overtimeTotal: number;
  commissionsTotal: number;
  grossPay: number;
  // Statutory (EPF/ETF). Computed on basic wages only (baseSalary), and only
  // for employees flagged as EPF/ETF members.
  epfEtfMember: boolean;
  epfEmployee: number; // 8% — deducted from the employee's pay
  epfEmployer: number; // 12% — employer cost, NOT deducted
  etf: number; // 3% — employer cost, NOT deducted
  advanceDeduction: number; // salary advances recovered this run
  deductions: number; // epfEmployee + advanceDeduction
  netPay: number; // grossPay − deductions
  employerCost: number; // grossPay + epfEmployer + etf (info only)
  dates: AttendanceDay[];
};

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

const DEFAULT_RATES: PayRates = { epfEmployee: 0.08, epfEmployer: 0.12, etf: 0.03 };

/** Computes salary lines for a month (YYYY-MM) from attendance, overtime, commissions and advances. */
export async function computePayroll(month: string): Promise<PayrollLineData[]> {
  const { start, end } = monthRange(month);
  const employees = await prisma.employee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const [attendance, commissions, overtime, advances, setting] = await Promise.all([
    prisma.attendance.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.commission.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.overtime.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.salaryAdvance.findMany({
      where: { status: "OUTSTANDING" },
      orderBy: { date: "asc" }, // oldest-first for whole-or-defer recovery
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);

  const rates = {
    epfEmployee: setting ? toNum(setting.epfEmployeeRate) : DEFAULT_RATES.epfEmployee,
    epfEmployer: setting ? toNum(setting.epfEmployerRate) : DEFAULT_RATES.epfEmployer,
    etf: setting ? toNum(setting.etfRate) : DEFAULT_RATES.etf,
  };

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
  const ot = new Map<string, number>();
  for (const o of overtime) {
    ot.set(o.employeeId, (ot.get(o.employeeId) ?? 0) + toNum(o.amount));
  }
  const outstandingByEmployee = new Map<string, { id: string; amount: number }[]>();
  for (const adv of advances) {
    const list = outstandingByEmployee.get(adv.employeeId) ?? [];
    list.push({ id: adv.id, amount: toNum(adv.amount) });
    outstandingByEmployee.set(adv.employeeId, list);
  }

  return employees.map((e) => {
    const daysWorked = days.get(e.id) ?? 0;
    const dailyRate = toNum(e.dailyRate);
    const line = computePayLine({
      daysWorked,
      dailyRate,
      overtimeTotal: ot.get(e.id) ?? 0,
      commissionsTotal: comm.get(e.id) ?? 0,
      epfEtfMember: e.epfEtfMember,
      outstandingAdvances: outstandingByEmployee.get(e.id) ?? [],
      rates,
    });
    return {
      employeeId: e.id,
      name: e.name,
      daysWorked,
      fullDays: fulls.get(e.id) ?? 0,
      halfDays: halves.get(e.id) ?? 0,
      absentDays: absents.get(e.id) ?? 0,
      dailyRate,
      baseSalary: line.baseSalary,
      overtimeTotal: line.overtimeTotal,
      commissionsTotal: line.commissionsTotal,
      grossPay: line.grossPay,
      epfEtfMember: e.epfEtfMember,
      epfEmployee: line.epfEmployee,
      epfEmployer: line.epfEmployer,
      etf: line.etf,
      advanceDeduction: line.advanceDeduction,
      deductions: line.deductions,
      netPay: line.netPay,
      employerCost: line.employerCost,
      dates: datesByEmployee.get(e.id) ?? [],
    };
  });
}
