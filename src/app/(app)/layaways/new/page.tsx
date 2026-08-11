import { PageHeader } from "@/components/page-header";
import { NewLayaway } from "@/components/new-layaway";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function NewLayawayPage() {
  // Recent-customer seed only; the picker searches the server as you type.
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, phone: true, nic: true }, take: 8 });
  return <div><PageHeader title="New layaway" subtitle="Reserve products while the customer pays the fixed price in installments."/><NewLayaway customers={customers}/></div>;
}
