import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { VehicleForm } from "@/components/vehicle-form";
import { updateConsignmentVehicle } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [vehicle, suppliers] = await Promise.all([
    prisma.consignmentVehicle.findUnique({ where: { id } }),
    prisma.supplier.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
  ]);
  if (!vehicle || vehicle.status === "SOLD") notFound();
  return <div className="mx-auto max-w-5xl">
    <PageHeader title="Edit consignment vehicle" subtitle="Update identity or commercial terms before the vehicle is sold" />
    <VehicleForm
      action={updateConsignmentVehicle.bind(null, vehicle.id)}
      suppliers={suppliers}
      submitLabel="Save vehicle"
      initial={{
        type: vehicle.kind,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year ? String(vehicle.year) : "",
        colour: vehicle.colour ?? "",
        engineNumber: vehicle.engineNumber,
        chassisNumber: vehicle.chassisNumber,
        supplierId: vehicle.supplierId,
        supplierReference: vehicle.supplierReference ?? "",
        receivedDate: vehicle.receivedAt.toISOString().slice(0, 10),
        listPrice: toNum(vehicle.listPrice),
        supplierPayable: toNum(vehicle.supplierSettlementDue),
        specifications: vehicle.specifications ?? "",
        notes: vehicle.notes ?? "",
        photoKeys: vehicle.photoKeys,
      }}
    />
  </div>;
}
