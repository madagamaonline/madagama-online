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
      acc.comm += toNum(l.commissionsTotal);
      acc.net += toNum(l.netPay);
      return acc;
    },
    { base: 0, comm: 0, net: 0 },
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
              <th className="px-2 text-right font-medium">Rate</th>
              <th className="px-2 text-right font-medium">Base</th>
              <th className="px-2 text-right font-medium">Commission</th>
              <th className="py-2 pl-2 text-right font-medium">Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {run.lines.map((l) => (
              <tr key={l.id} className="border-b border-border">
                <td className="py-2 font-medium">{l.employee.name}</td>
                <td className="px-2 text-right">{toNum(l.daysWorked)}</td>
                <td className="px-2 text-right">{formatLKR(l.dailyRate)}</td>
                <td className="px-2 text-right">{formatLKR(l.baseSalary)}</td>
                <td className="px-2 text-right">{formatLKR(l.commissionsTotal)}</td>
                <td className="py-2 pl-2 text-right font-semibold">{formatLKR(l.netPay)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-border">
              <td className="py-2 font-semibold" colSpan={3}>
                Total
              </td>
              <td className="px-2 text-right font-semibold">{formatLKR(totals.base)}</td>
              <td className="px-2 text-right font-semibold">{formatLKR(totals.comm)}</td>
              <td className="py-2 pl-2 text-right font-semibold">{formatLKR(totals.net)}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-8 text-xs text-muted">
          Computed from daily attendance (Present = 1 day, Half day = 0.5) plus commissions for the period.
        </p>
      </div>
    </div>
  );
}
