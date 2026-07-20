import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function EmployeesLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
