import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";
import { PageHeader } from "@/components/page-header";
import { PayrollControls } from "@/components/payroll-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, formatDateTime, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ATT_STATUS: Record<string, { label: string; cls: string }> = {
  PRESENT: { label: "Present", cls: "text-green-700" },
  HALF_DAY: { label: "Half day", cls: "font-semibold text-clay-ink" },
  ABSENT: { label: "Absent", cls: "text-danger" },
};

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? new Date().toISOString().slice(0, 7);

  const [lines, runs] = await Promise.all([
    computePayroll(month),
    prisma.payrollRun.findMany({
      orderBy: { period: "desc" },
      include: { _count: { select: { lines: true } }, lines: { select: { netPay: true } } },
      take: 24,
    }),
  ]);

  const totalNet = lines.reduce((s, l) => s + l.netPay, 0);

  return (
    <div>
      <PageHeader title="Payroll" subtitle="Monthly salary sheets from attendance + commissions" />

      <Card className="mb-4">
        <CardContent>
          <PayrollControls month={month} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Preview — {month}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">No active employees.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH className="text-right">Days</TH>
                  <TH className="text-right">Daily Rate</TH>
                  <TH className="text-right">Base</TH>
                  <TH className="text-right">Commission</TH>
                  <TH className="text-right">Net Pay</TH>
                </TR>
              </THead>
              <TBody>
                {lines.map((l) => (
                  <TR key={l.employeeId}>
                    <TD className="font-medium">{l.name}</TD>
                    <TD className="text-right align-top">
                      {l.dates.length > 0 ? (
                        <details>
                          <summary className="cursor-pointer list-none">
                            <span className="underline decoration-dotted underline-offset-2 font-medium">
                              {l.daysWorked} days
                            </span>
                            <span className="mt-0.5 block text-[11px] font-normal text-muted">
                              {l.fullDays} full · {l.halfDays} half
                              {l.absentDays ? ` · ${l.absentDays} absent` : ""}
                            </span>
                          </summary>
                          <ul className="mt-1.5 space-y-0.5 text-left text-xs font-normal">
                            {l.dates.map((d) => (
                              <li key={d.date.toISOString()} className="flex items-center justify-between gap-3">
                                <span className="text-muted">{formatDate(d.date)}</span>
                                <span className={ATT_STATUS[d.status]?.cls ?? "text-muted"}>
                                  {ATT_STATUS[d.status]?.label ?? d.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : (
                        <span className="text-muted">0 days</span>
                      )}
                    </TD>
                    <TD className="text-right">{formatLKR(l.dailyRate)}</TD>
                    <TD className="text-right">{formatLKR(l.baseSalary)}</TD>
                    <TD className="text-right">{formatLKR(l.commissionsTotal)}</TD>
                    <TD className="text-right font-semibold">{formatLKR(l.netPay)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold" colSpan={5}>
                    Total
                  </TD>
                  <TD className="text-right font-semibold">{formatLKR(totalNet)}</TD>
                </TR>
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved Salary Sheets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted">None saved yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH>Generated</TH>
                  <TH className="text-right">Employees</TH>
                  <TH className="text-right">Total Net</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      <Link href={`/payroll/${r.id}`} className="text-primary hover:underline">
                        {r.period}
                      </Link>
                    </TD>
                    <TD className="text-muted">{formatDateTime(r.generatedAt)}</TD>
                    <TD className="text-right">{r._count.lines}</TD>
                    <TD className="text-right font-medium">
                      {formatLKR(r.lines.reduce((s, l) => s + Number(l.netPay), 0))}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
