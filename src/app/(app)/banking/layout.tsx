import { requireStaffFinanceAccess } from "@/lib/auth";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  await requireStaffFinanceAccess();
  return children;
}
