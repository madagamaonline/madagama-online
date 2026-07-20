import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
