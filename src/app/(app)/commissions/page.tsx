import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AddCommission } from "@/components/add-commission";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatLKR, formatDate } from "@/lib/utils";
import { deleteCommission } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  const [employees, commissions] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.commission.findMany({
      orderBy: { date: "desc" },
      include: { employee: { select: { name: true } } },
      take: 100,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Commissions" subtitle="One-off commissions for staff" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AddCommission employees={employees} />
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Commissions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {commissions.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted">No commissions yet.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Employee</TH>
                      <TH>Reason</TH>
                      <TH className="text-right">Amount</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {commissions.map((c) => (
                      <TR key={c.id}>
                        <TD className="text-muted">{formatDate(c.date)}</TD>
                        <TD className="font-medium">{c.employee.name}</TD>
                        <TD>{c.reason}</TD>
                        <TD className="text-right font-medium">{formatLKR(c.amount)}</TD>
                        <TD className="text-right">
                          <form action={deleteCommission.bind(null, c.id)}>
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
