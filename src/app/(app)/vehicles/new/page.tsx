import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { VehicleForm } from "@/components/vehicle-form";
import { createConsignmentVehicle } from "../actions";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function NewVehiclePage() {
  await requireAdmin();
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } });
  return <div className="mx-auto max-w-5xl"><PageHeader title="Receive consignment vehicle" subtitle="Record the supplier-owned machine without creating a purchase or supplier payable" /><VehicleForm action={createConsignmentVehicle} suppliers={suppliers} /></div>;
}
