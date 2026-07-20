import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
