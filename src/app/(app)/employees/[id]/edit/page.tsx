import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { EmployeeForm } from "@/components/employee-form";
import { toNum } from "@/lib/utils";
import { updateEmployee } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await prisma.employee.findUnique({ where: { id } });
  if (!e) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Employee" subtitle={e.name} />
      <EmployeeForm
        action={updateEmployee.bind(null, id)}
        submitLabel="Save Changes"
        initial={{
          name: e.name,
          nic: e.nic ?? "",
          phone: e.phone ?? "",
          address: e.address ?? "",
          position: e.position ?? "",
          dailyRate: toNum(e.dailyRate),
          epfEtfMember: e.epfEtfMember,
          epfNumber: e.epfNumber ?? "",
        }}
      />
    </div>
  );
}
