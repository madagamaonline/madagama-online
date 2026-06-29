import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { computePayroll } from "@/lib/payroll";
import { PageHeader } from "@/components/page-header";
import { PayrollControls } from "@/components/payroll-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
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
  const totalEmployerContrib = lines.reduce((s, l) => s + l.epfEmployer + l.etf, 0);

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle="Monthly salary sheets from attendance, overtime, commissions, EPF/ETF & advances"
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/overtime" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Overtime
            </Link>
            <Link href="/commissions" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Commissions
            </Link>
            <Link href="/advances" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Advances
            </Link>
          </div>
        }
      />

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
                  <TH className="text-right">Base</TH>
                  <TH className="text-right">Overtime</TH>
                  <TH className="text-right">Commission</TH>
                  <TH className="text-right">EPF (8%)</TH>
                  <TH className="text-right">Advance</TH>
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
                    <TD className="text-right tabular">{formatLKR(l.baseSalary)}</TD>
                    <TD className="text-right tabular">{l.overtimeTotal ? formatLKR(l.overtimeTotal) : "—"}</TD>
                    <TD className="text-right tabular">{l.commissionsTotal ? formatLKR(l.commissionsTotal) : "—"}</TD>
                    <TD className="text-right tabular text-danger">
                      {l.epfEmployee ? `−${formatLKR(l.epfEmployee)}` : l.epfEtfMember ? formatLKR(0) : "—"}
                    </TD>
                    <TD className="text-right tabular text-danger">
                      {l.advanceDeduction ? `−${formatLKR(l.advanceDeduction)}` : "—"}
                    </TD>
                    <TD className="text-right font-semibold tabular">{formatLKR(l.netPay)}</TD>
                  </TR>
                ))}
                <TR>
                  <TD className="font-semibold" colSpan={7}>
                    Total net pay
                  </TD>
                  <TD className="text-right font-semibold tabular">{formatLKR(totalNet)}</TD>
                </TR>
                <TR>
                  <TD className="text-xs text-muted" colSpan={7}>
                    + Employer contributions (EPF employer share + ETF) — company cost, paid on top of net
                  </TD>
                  <TD className="text-right text-xs text-muted tabular">{formatLKR(totalEmployerContrib)}</TD>
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
