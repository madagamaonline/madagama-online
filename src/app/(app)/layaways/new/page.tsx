import { PageHeader } from "@/components/page-header";
import { NewLayaway } from "@/components/new-layaway";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function NewLayawayPage() {
  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, nic: true } });
  return <div><PageHeader title="New layaway" subtitle="Reserve products while the customer pays the fixed price in installments."/><NewLayaway customers={customers}/></div>;
}
