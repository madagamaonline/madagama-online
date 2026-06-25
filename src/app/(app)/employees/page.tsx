import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import { toggleEmployeeActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Staff and daily rates"
        action={
          <Link href="/employees/new">
            <Button>
              <Plus className="h-4 w-4" /> New Employee
            </Button>
          </Link>
        }
      />
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">No employees yet.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Position</TH>
                  <TH>Phone</TH>
                  <TH className="text-right">Daily Rate</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {employees.map((e) => (
                  <TR key={e.id} className={e.active ? "" : "opacity-50"}>
                    <TD className="font-medium">{e.name}</TD>
                    <TD>{e.position ?? "—"}</TD>
                    <TD>{e.phone ?? "—"}</TD>
                    <TD className="text-right">{formatLKR(e.dailyRate)}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/employees/${e.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <form action={toggleEmployeeActive.bind(null, e.id, !e.active)}>
                          <Button variant="ghost" size="sm" type="submit" className="text-muted">
                            {e.active ? "Disable" : "Enable"}
                          </Button>
                        </form>
                      </div>
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
