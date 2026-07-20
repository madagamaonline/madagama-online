import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function ShiftReportLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
