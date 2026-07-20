import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function AdvancesLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
