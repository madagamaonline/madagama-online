import { round2 } from "./utils";

// Pure payroll math — intentionally free of `server-only`/Prisma imports so it
// can be unit-tested directly (see payroll.test.ts) and reused by both the
// preview (computePayroll) and the authoritative in-transaction recovery
// (generatePayroll).

export type PayRates = { epfEmployee: number; epfEmployer: number; etf: number };

export type PayLineInput = {
  daysWorked: number;
  dailyRate: number;
  overtimeTotal: number;
  commissionsTotal: number;
  epfEtfMember: boolean;
  outstandingAdvances: { id: string; amount: number }[]; // oldest-first
  rates: PayRates;
};

export type PayLine = {
  baseSalary: number;
  overtimeTotal: number;
  commissionsTotal: number;
  grossPay: number;
  epfEmployee: number;
  epfEmployer: number;
  etf: number;
  advanceDeduction: number;
  deductions: number;
  netPay: number;
  employerCost: number;
  recoveredAdvanceIds: string[];
};

/**
 * Greedily pick salary advances to recover this run, oldest-first, whole-or-defer:
 * an advance is recovered in full only if it fits within the available capacity
 * (net pay before advance recovery); otherwise it (and the rest) is deferred to a
 * later run, so net pay never goes below zero.
 */
export function selectAdvancesToRecover(
  advances: { id: string; amount: number }[],
  capacity: number,
): { deducted: number; ids: string[] } {
  const cap = round2(Math.max(0, capacity));
  let deducted = 0;
  const ids: string[] = [];
  for (const a of advances) {
    const amt = round2(a.amount);
    if (round2(deducted + amt) > cap + 1e-9) break; // would exceed capacity → defer the rest
    ids.push(a.id);
    deducted = round2(deducted + amt);
  }
  return { deducted, ids };
}

/**
 * Pure pay-line math. EPF/ETF are computed on basic wages only and only for
 * members; the employee 8% is deducted from pay while employer EPF/ETF are a
 * company cost. Salary advances are recovered greedily (oldest-first, whole-or-
 * defer) within net pay, so net never goes below zero.
 */
export function computePayLine(input: PayLineInput): PayLine {
  const baseSalary = round2(input.daysWorked * input.dailyRate);
  const overtimeTotal = round2(input.overtimeTotal);
  const commissionsTotal = round2(input.commissionsTotal);
  const grossPay = round2(baseSalary + overtimeTotal + commissionsTotal);

  const epfEmployee = input.epfEtfMember ? round2(baseSalary * input.rates.epfEmployee) : 0;
  const epfEmployer = input.epfEtfMember ? round2(baseSalary * input.rates.epfEmployer) : 0;
  const etf = input.epfEtfMember ? round2(baseSalary * input.rates.etf) : 0;

  const capacity = round2(grossPay - epfEmployee);
  const { deducted: advanceDeduction, ids: recoveredAdvanceIds } = selectAdvancesToRecover(
    input.outstandingAdvances,
    capacity,
  );

  const deductions = round2(epfEmployee + advanceDeduction);
  return {
    baseSalary,
    overtimeTotal,
    commissionsTotal,
    grossPay,
    epfEmployee,
    epfEmployer,
    etf,
    advanceDeduction,
    deductions,
    netPay: round2(grossPay - deductions),
    employerCost: round2(grossPay + epfEmployer + etf),
    recoveredAdvanceIds,
  };
}
