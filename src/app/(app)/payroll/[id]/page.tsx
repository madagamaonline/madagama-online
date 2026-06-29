import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatLKR, formatDate, toNum } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SalarySheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [run, setting] = await Promise.all([
    prisma.payrollRun.findUnique({
      where: { id },
      include: { lines: { include: { employee: { select: { name: true } } }, orderBy: { employee: { name: "asc" } } } },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  if (!run) notFound();

  const totals = run.lines.reduce(
    (acc, l) => {
      acc.base += toNum(l.baseSalary);
      acc.ot += toNum(l.overtimeTotal);
      acc.comm += toNum(l.commissionsTotal);
      acc.epfEmp += toNum(l.epfEmployee);
      acc.advance += toNum(l.advanceDeduction);
      acc.net += toNum(l.netPay);
      acc.employerContrib += toNum(l.epfEmployer) + toNum(l.etf);
      return acc;
    },
    { base: 0, ot: 0, comm: 0, epfEmp: 0, advance: 0, net: 0, employerContrib: 0 },
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/payroll">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <PrintButton label="Print Salary Sheet" />
      </div>

      <div className="print-area rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 border-b border-border pb-4">
          <h1 className="text-xl font-bold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
          <p className="text-sm text-muted">Salary Sheet — {run.period}</p>
          <p className="text-xs text-muted">Generated {formatDate(run.generatedAt)}</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-medium">Employee</th>
              <th className="px-2 text-right font-medium">Days</th>
              <th className="px-2 text-right font-medium">Base</th>
              <th className="px-2 text-right font-medium">Overtime</th>
              <th className="px-2 text-right font-medium">Commission</th>
              <th className="px-2 text-right font-medium">EPF (8%)</th>
              <th className="px-2 text-right font-medium">Advance</th>
              <th className="py-2 pl-2 text-right font-medium">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {run.lines.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="py-2 font-medium">{l.employee.name}</td>
                <td className="px-2 text-right tabular">{toNum(l.daysWorked)}</td>
                <td className="px-2 text-right tabular">{formatLKR(l.baseSalary)}</td>
                <td className="px-2 text-right tabular">{toNum(l.overtimeTotal) ? formatLKR(l.overtimeTotal) : "—"}</td>
                <td className="px-2 text-right tabular">{toNum(l.commissionsTotal) ? formatLKR(l.commissionsTotal) : "—"}</td>
                <td className="px-2 text-right tabular">{toNum(l.epfEmployee) ? `−${formatLKR(l.epfEmployee)}` : "—"}</td>
                <td className="px-2 text-right tabular">{toNum(l.advanceDeduction) ? `−${formatLKR(l.advanceDeduction)}` : "—"}</td>
                <td className="py-2 pl-2 text-right font-semibold tabular">{formatLKR(l.netPay)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border">
              <td className="py-2 font-semibold">Total</td>
              <td className="px-2 text-right"></td>
              <td className="px-2 text-right font-semibold tabular">{formatLKR(totals.base)}</td>
              <td className="px-2 text-right font-semibold tabular">{formatLKR(totals.ot)}</td>
              <td className="px-2 text-right font-semibold tabular">{formatLKR(totals.comm)}</td>
              <td className="px-2 text-right font-semibold tabular">{formatLKR(totals.epfEmp)}</td>
              <td className="px-2 text-right font-semibold tabular">{formatLKR(totals.advance)}</td>
              <td className="py-2 pl-2 text-right font-semibold tabular">{formatLKR(totals.net)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Total net pay (to employees)</span>
              <span className="font-semibold tabular">{formatLKR(totals.net)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Employee EPF withheld</span>
              <span className="tabular">{formatLKR(totals.epfEmp)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Employer EPF + ETF (company cost)</span>
              <span className="tabular">{formatLKR(totals.employerContrib)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1">
              <span className="font-medium">Total to remit to EPF/ETF funds</span>
              <span className="font-semibold tabular">{formatLKR(totals.epfEmp + totals.employerContrib)}</span>
            </div>
          </div>
        </div>

        <p className="mt-8 text-xs text-muted">
          Computed from daily attendance (Present = 1 day, Half day = 0.5) plus overtime and
          commissions for the period. EPF (employee 8%) and any salary advances are deducted from net
          pay; employer EPF (12%) + ETF (3%) are a company cost on basic wages. The amount to remit to
          the funds is the employee EPF withheld plus the employer EPF/ETF contributions.
        </p>
      </div>
    </div>
  );
}
