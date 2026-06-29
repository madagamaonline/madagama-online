import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AddOvertime } from "@/components/add-overtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatLKR, formatDate, formatNumber } from "@/lib/utils";
import { deleteOvertime } from "./actions";

export const dynamic = "force-dynamic";

export default async function OvertimePage() {
  const [employees, overtime] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.overtime.findMany({
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true } } },
      take: 100,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Overtime" subtitle="Extra pay for hours worked beyond normal" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AddOvertime employees={employees} />
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Overtime</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {overtime.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted">No overtime yet.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Employee</TH>
                      <TH className="text-right">Hours</TH>
                      <TH className="text-right">Rate</TH>
                      <TH className="text-right">Amount</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {overtime.map((o) => (
                      <TR key={o.id}>
                        <TD className="text-muted">{formatDate(o.date)}</TD>
                        <TD className="font-medium">{o.employee.name}</TD>
                        <TD className="text-right tabular">{formatNumber(o.hours)}</TD>
                        <TD className="text-right tabular">{formatLKR(o.rate)}</TD>
                        <TD className="text-right font-medium tabular">{formatLKR(o.amount)}</TD>
                        <TD className="text-right">
                          <form action={deleteOvertime.bind(null, o.id)}>
                            <Button variant="ghost" size="sm" type="submit" className="text-danger">
                              Delete
                            </Button>
                          </form>
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
