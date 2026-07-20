"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeVehicleDeal, validateVehicleDeal } from "@/lib/vehicle-sales";

export type VehicleFormState = { error?: string };

const schema = z.object({
  kind: z.enum(["TRACTOR", "HARVESTER", "COMBINE_HARVESTER"]),
  make: z.string().trim().min(1, "Make is required"),
  model: z.string().trim().min(1, "Model is required"),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  colour: z.string().trim().optional(),
  engineNumber: z.string().trim().min(1, "Engine number is required"),
  chassisNumber: z.string().trim().min(1, "Chassis number is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  supplierReference: z.string().trim().optional(),
  listPrice: z.coerce.number().positive("Enter a valid list price"),
  supplierSettlementDue: z.coerce.number().min(0, "Enter a valid supplier amount"),
  receivedAt: z.string().optional(),
  specifications: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  photoKeys: z.array(z.string()).default([]),
});

function parse(formData: FormData) {
  const rawYear = String(formData.get("year") ?? "").trim();
  const photoKeys = String(formData.get("photoKeys") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return schema.safeParse({
    kind: formData.get("kind"),
    make: formData.get("make"),
    model: formData.get("model"),
    year: rawYear ? rawYear : undefined,
    colour: formData.get("colour") || undefined,
    engineNumber: formData.get("engineNumber"),
    chassisNumber: formData.get("chassisNumber"),
    supplierId: formData.get("supplierId"),
    supplierReference: formData.get("supplierReference") || undefined,
    listPrice: formData.get("listPrice"),
    supplierSettlementDue: formData.get("supplierSettlementDue"),
    receivedAt: formData.get("receivedAt") || undefined,
    specifications: formData.get("specifications") || undefined,
    notes: formData.get("notes") || undefined,
    photoKeys,
  });
}

function duplicateMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = String(error.meta?.target ?? "");
  if (target.includes("engineNumber")) return "That engine number is already registered.";
  if (target.includes("chassisNumber")) return "That chassis number is already registered.";
  return "This vehicle already exists.";
}

export async function createConsignmentVehicle(
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  let user;
  try {
    user = await requireActionAdmin();
  } catch {
    return { error: "Only an administrator can receive a consignment vehicle." };
  }
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vehicle details." };
  const data = parsed.data;
  const deal = computeVehicleDeal(data);
  const dealError = validateVehicleDeal(deal);
  if (dealError) return { error: dealError };

  let id: string;
  try {
    const vehicle = await prisma.consignmentVehicle.create({
      data: {
        kind: data.kind,
        make: data.make,
        model: data.model,
        year: data.year,
        colour: data.colour || null,
        engineNumber: data.engineNumber.toUpperCase(),
        chassisNumber: data.chassisNumber.toUpperCase(),
        supplierId: data.supplierId,
        supplierReference: data.supplierReference || null,
        listPrice: deal.listPrice,
        supplierSettlementDue: deal.supplierSettlementDue,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : new Date(),
        specifications: data.specifications || null,
        notes: data.notes || null,
        photoKeys: data.photoKeys,
        receivedByUserId: user.id,
        status: "AVAILABLE",
      },
    });
    id = vehicle.id;
  } catch (error) {
    const duplicate = duplicateMessage(error);
    if (duplicate) return { error: duplicate };
    console.error("createConsignmentVehicle failed", error);
    return { error: "Could not save the vehicle. Please try again." };
  }

  revalidatePath("/vehicles");
  redirect(`/vehicles/${id}?new=1`);
}

export async function updateConsignmentVehicle(
  id: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  try {
    await requireActionAdmin();
  } catch {
    return { error: "Only an administrator can edit vehicle terms." };
  }
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vehicle details." };
  const data = parsed.data;
  const deal = computeVehicleDeal(data);
  const dealError = validateVehicleDeal(deal);
  if (dealError) return { error: dealError };

  try {
    const current = await prisma.consignmentVehicle.findUnique({ where: { id }, select: { status: true } });
    if (!current) return { error: "Vehicle not found." };
    if (current.status === "SOLD") return { error: "A sold vehicle cannot be edited." };
    await prisma.consignmentVehicle.update({
      where: { id },
      data: {
        kind: data.kind,
        make: data.make,
        model: data.model,
        year: data.year,
        colour: data.colour || null,
        engineNumber: data.engineNumber.toUpperCase(),
        chassisNumber: data.chassisNumber.toUpperCase(),
        supplierId: data.supplierId,
        supplierReference: data.supplierReference || null,
        listPrice: deal.listPrice,
        supplierSettlementDue: deal.supplierSettlementDue,
        receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
        specifications: data.specifications || null,
        notes: data.notes || null,
        photoKeys: data.photoKeys,
      },
    });
  } catch (error) {
    const duplicate = duplicateMessage(error);
    if (duplicate) return { error: duplicate };
    console.error("updateConsignmentVehicle failed", error);
    return { error: "Could not update the vehicle. Please try again." };
  }
  revalidatePath("/vehicles");
  revalidatePath(`/vehicles/${id}`);
  redirect(`/vehicles/${id}`);
}
