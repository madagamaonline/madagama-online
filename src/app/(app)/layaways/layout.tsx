import { requireUser } from "@/lib/auth";
export default async function LayawayLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
