import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AddAdvance } from "@/components/add-advance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLKR, formatDate } from "@/lib/utils";
import { deleteAdvance } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdvancesPage() {
  const [employees, advances, runs] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.salaryAdvance.findMany({
      orderBy: [{ status: "asc" }, { date: "desc" }],
      include: { employee: { select: { name: true } } },
      take: 200,
    }),
    prisma.payrollRun.findMany({ select: { id: true, period: true } }),
  ]);
  const periodByRun = new Map(runs.map((r) => [r.id, r.period]));

  const outstandingTotal = advances
    .filter((a) => a.status === "OUTSTANDING")
    .reduce((s, a) => s + Number(a.amount), 0);

  return (
    <div>
      <PageHeader
        title="Salary Advances"
        subtitle="Money paid up front, auto-recovered from a later payroll"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AddAdvance employees={employees} />
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Advances{" "}
                <span className="ml-2 text-sm font-normal text-muted">
                  Outstanding: <span className="tabular">{formatLKR(outstandingTotal)}</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {advances.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted">No advances yet.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Employee</TH>
                      <TH className="text-right">Amount</TH>
                      <TH>Status</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {advances.map((a) => (
                      <TR key={a.id}>
                        <TD className="text-muted">{formatDate(a.date)}</TD>
                        <TD className="font-medium">{a.employee.name}</TD>
                        <TD className="text-right font-medium tabular">{formatLKR(a.amount)}</TD>
                        <TD>
                          {a.status === "RECOVERED" ? (
                            <Badge tone="green">
                              Recovered{a.recoveredRunId && periodByRun.get(a.recoveredRunId) ? ` · ${periodByRun.get(a.recoveredRunId)}` : ""}
                            </Badge>
                          ) : (
                            <Badge tone="amber">Outstanding</Badge>
                          )}
                        </TD>
                        <TD className="text-right">
                          {a.status === "OUTSTANDING" && (
                            <form action={deleteAdvance.bind(null, a.id)}>
                              <Button variant="ghost" size="sm" type="submit" className="text-danger">
                                Delete
                              </Button>
                            </form>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
