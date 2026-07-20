import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function OvertimeLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
