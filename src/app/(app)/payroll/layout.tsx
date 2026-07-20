import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
