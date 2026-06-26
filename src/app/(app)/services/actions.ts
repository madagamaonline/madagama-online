"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, type ServiceJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateServiceJobNumber } from "@/lib/service-job-number";

export type ServiceJobFormState = { error?: string };

const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const schema = z.object({
  itemName: z.string().min(1, "Item name is required"),
  brand: z.string().optional(),
  serialNumber: z.string().optional(),
  underWarranty: z.boolean().optional(),
  issue: z.string().min(1, "Describe the problem or requested work"),
  resolution: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  customerId: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  photoKeys: z.array(z.string()).optional(),
});

function parse(formData: FormData) {
  const photos = (formData.get("photoKeys") as string | null) ?? "";
  return schema.safeParse({
    itemName: formData.get("itemName"),
    brand: formData.get("brand") || undefined,
    serialNumber: formData.get("serialNumber") || undefined,
    underWarranty: formData.get("underWarranty") === "on",
    issue: formData.get("issue"),
    resolution: formData.get("resolution") || undefined,
    notes: formData.get("notes") || undefined,
    status: (formData.get("status") as string) || undefined,
    customerId: formData.get("customerId") || undefined,
    contactName: formData.get("contactName") || undefined,
    contactPhone: formData.get("contactPhone") || undefined,
    photoKeys: photos
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  });
}

export async function createServiceJob(
  _prev: ServiceJobFormState,
  formData: FormData,
): Promise<ServiceJobFormState> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired — please sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const status: ServiceJobStatus = d.status ?? "PENDING";

  let jobId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const job = await prisma.$transaction(async (tx) => {
        const jobNumber = await generateServiceJobNumber(tx);
        return tx.serviceJob.create({
          data: {
            jobNumber,
            status,
            itemName: d.itemName.trim(),
            brand: d.brand?.trim() || null,
            serialNumber: d.serialNumber?.trim() || null,
            underWarranty: d.underWarranty ?? false,
            issue: d.issue.trim(),
            resolution: d.resolution?.trim() || null,
            notes: d.notes?.trim() || null,
            photoKeys: d.photoKeys ?? [],
            customerId: d.customerId || null,
            contactName: d.customerId ? null : d.contactName?.trim() || null,
            contactPhone: d.customerId ? null : d.contactPhone?.trim() || null,
            completedAt: status === "COMPLETED" ? new Date() : null,
            createdByUserId: session.id,
            events: {
              create: {
                type: "CREATED",
                status,
                createdByUserId: session.id,
              },
            },
          },
        });
      });
      jobId = job.id;
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" &&
        attempt < 2
      ) {
        continue; // duplicate job number — retry for the next one
      }
      console.error("createServiceJob failed", e);
      return { error: "Could not save the service job. Please try again." };
    }
  }
  if (!jobId) return { error: "Could not generate a job number. Please try again." };

  revalidatePath("/services");
  redirect(`/services/${jobId}?new=1`);
}

export async function updateServiceJob(
  id: string,
  _prev: ServiceJobFormState,
  formData: FormData,
): Promise<ServiceJobFormState> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired — please sign in again." };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;

  try {
    await prisma.serviceJob.update({
      where: { id },
      data: {
        itemName: d.itemName.trim(),
        brand: d.brand?.trim() || null,
        serialNumber: d.serialNumber?.trim() || null,
        underWarranty: d.underWarranty ?? false,
        issue: d.issue.trim(),
        resolution: d.resolution?.trim() || null,
        notes: d.notes?.trim() || null,
        photoKeys: d.photoKeys ?? [],
        customerId: d.customerId || null,
        contactName: d.customerId ? null : d.contactName?.trim() || null,
        contactPhone: d.customerId ? null : d.contactPhone?.trim() || null,
      },
    });
  } catch (e) {
    console.error("updateServiceJob failed", e);
    return { error: "Could not update the service job. Please try again." };
  }

  revalidatePath("/services");
  revalidatePath(`/services/${id}`);
  redirect(`/services/${id}`);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateServiceJobStatus(
  id: string,
  status: ServiceJobStatus,
  note?: string,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired — please sign in again." };
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serviceJob.update({
        where: { id },
        data: {
          status,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
      await tx.serviceJobEvent.create({
        data: {
          serviceJobId: id,
          type: "STATUS_CHANGE",
          status,
          note: note?.trim() || null,
          createdByUserId: session.id,
        },
      });
    });
  } catch (e) {
    console.error("updateServiceJobStatus failed", e);
    return { ok: false, error: "Could not update the status. Please try again." };
  }

  revalidatePath("/services");
  revalidatePath(`/services/${id}`);
  return { ok: true };
}

export async function addServiceJobNote(id: string, note: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session has expired — please sign in again." };
  const text = note.trim();
  if (!text) return { ok: false, error: "Note can't be empty." };

  try {
    await prisma.serviceJobEvent.create({
      data: {
        serviceJobId: id,
        type: "NOTE",
        note: text,
        createdByUserId: session.id,
      },
    });
  } catch (e) {
    console.error("addServiceJobNote failed", e);
    return { ok: false, error: "Could not add the note. Please try again." };
  }

  revalidatePath(`/services/${id}`);
  return { ok: true };
}

export async function deleteServiceJob(id: string): Promise<ServiceJobFormState> {
  const session = await getSession();
  if (!session) return { error: "Your session has expired — please sign in again." };
  try {
    await prisma.serviceJob.delete({ where: { id } });
  } catch (e) {
    console.error("deleteServiceJob failed", e);
    return { error: "Could not delete the service job. Please try again." };
  }
  revalidatePath("/services");
  redirect("/services");
}
