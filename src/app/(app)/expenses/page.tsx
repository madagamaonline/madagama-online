import { startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AddExpense } from "@/components/add-expense";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatLKR, formatDate } from "@/lib/utils";
import { deleteExpense } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const monthStart = startOfMonth(new Date());
  const [expenses, monthAgg] = await Promise.all([
    prisma.expense.findMany({ orderBy: { date: "desc" }, take: 100 }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: monthStart } } }),
  ]);

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Operating expenses" />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="This Month's Expenses" value={formatLKR(monthAgg._sum.amount ?? 0)} tone="amber" />
        <StatCard label="Entries" value={String(expenses.length)} tone="blue" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <AddExpense />
        </div>
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Expenses</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expenses.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted">No expenses logged.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH>
                      <TH>Category</TH>
                      <TH>Description</TH>
                      <TH className="text-right">Amount</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {expenses.map((e) => (
                      <TR key={e.id}>
                        <TD className="text-muted">{formatDate(e.date)}</TD>
                        <TD>
                          <Badge>{e.category}</Badge>
                        </TD>
                        <TD>{e.description ?? "—"}</TD>
                        <TD className="text-right font-medium">{formatLKR(e.amount)}</TD>
                        <TD className="text-right">
                          <form action={deleteExpense.bind(null, e.id)}>
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
