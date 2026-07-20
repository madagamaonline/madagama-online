import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { VehicleSaleForm } from "@/components/vehicle-sale-form";
import { createVehicleSale } from "../actions";
import { toNum } from "@/lib/utils";
import { requireStaffFinanceAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function NewVehicleSalePage({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  await requireStaffFinanceAccess();
  const { vehicle: vehicleId } = await searchParams;
  if (!vehicleId) redirect("/vehicles");
  const [vehicle, customers, employees] = await Promise.all([
    prisma.consignmentVehicle.findUnique({ where: { id: vehicleId }, include: { supplier: { select: { name: true } } } }),
    prisma.customer.findMany({ select: { id: true, name: true, phone: true }, orderBy: { name: "asc" }, take: 1000 }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!vehicle || vehicle.status !== "AVAILABLE") notFound();
  return <div className="mx-auto max-w-6xl"><PageHeader title="New vehicle sale" subtitle="Confirm the customer, sale method, payment received, and permanent commercial split" /><VehicleSaleForm action={createVehicleSale} vehicle={{ id: vehicle.id, label: `${vehicle.make} ${vehicle.model}`, engineNumber: vehicle.engineNumber, chassisNumber: vehicle.chassisNumber, supplierName: vehicle.supplier.name, listPrice: toNum(vehicle.listPrice), supplierSettlementDue: toNum(vehicle.supplierSettlementDue) }} customers={customers} employees={employees} /></div>;
}
