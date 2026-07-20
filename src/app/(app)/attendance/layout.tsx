import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
