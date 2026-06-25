import { PageHeader } from "@/components/page-header";
import { EmployeeForm } from "@/components/employee-form";
import { createEmployee } from "../actions";

export const dynamic = "force-dynamic";

export default function NewEmployeePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Employee" />
      <EmployeeForm action={createEmployee} submitLabel="Create Employee" />
    </div>
  );
}
