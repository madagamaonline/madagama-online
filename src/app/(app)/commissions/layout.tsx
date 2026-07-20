import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function CommissionsLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
