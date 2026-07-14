"use server";

import type { CustomerRequestStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActionUser } from "@/lib/auth";
import { validateLkPhone } from "@/lib/phone";
import { REQUEST_STATUS_OPTIONS } from "@/lib/customer-requests";

export type CustomerRequestFormState = { error?: string };
export type CustomerRequestStatusState = { error?: string; success?: boolean };

const formSchema = z.object({
  title: z.string().trim().min(1, "Requested product or subject is required").max(200),
  type: z.enum(["PRODUCT_INQUIRY", "IMPORT_REQUEST", "PRICE_INQUIRY", "OTHER"]),
  description: z.string().trim().max(4000).optional(),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(100000),
  budget: z.string().trim().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  customerId: z.string().trim().optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  productId: z.string().trim().optional(),
  supplierId: z.string().trim().optional(),
  assignedToUserId: z.string().trim().min(1, "Please assign the request to a staff member"),
  followUpDate: z.string().trim().optional(),
  expectedArrivalDate: z.string().trim().optional(),
  remindBySms: z.boolean(),
});

function optionalId(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function parseForm(formData: FormData) {
  return formSchema.safeParse({
    title: formData.get("title"),
    type: formData.get("type"),
    description: optionalId(formData.get("description")),
    quantity: formData.get("quantity"),
    budget: optionalId(formData.get("budget")),
    priority: formData.get("priority"),
    customerId: optionalId(formData.get("customerId")),
    contactName: optionalId(formData.get("contactName")),
    contactPhone: optionalId(formData.get("contactPhone")),
    productId: optionalId(formData.get("productId")),
    supplierId: optionalId(formData.get("supplierId")),
    assignedToUserId: formData.get("assignedToUserId"),
    followUpDate: optionalId(formData.get("followUpDate")),
    expectedArrivalDate: optionalId(formData.get("expectedArrivalDate")),
    remindBySms: formData.get("remindBySms") === "on",
  });
}

function dateFromBusinessDay(value?: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  return date;
}

function validatedBudget(value?: string): number | null {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("Budget must be a positive number");
  return number;
}

function normalizedContactPhone(customerId?: string, phone?: string): string | null {
  if (customerId || !phone) return null;
  const checked = validateLkPhone(phone);
  if (!checked.ok) throw new Error(checked.error);
  return checked.normalized;
}

function revalidateRequestPaths(id?: string, customerId?: string) {
  revalidatePath("/requests");
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/requests/${id}`);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function createCustomerRequest(
  _previous: CustomerRequestFormState,
  formData: FormData,
): Promise<CustomerRequestFormState> {
  const user = await requireActionUser();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };

  const d = parsed.data;
  if (!d.customerId && !d.contactName && !d.contactPhone) {
    return { error: "Choose a customer or enter a walk-in name or phone number" };
  }

  let phone: string | null;
  let budget: number | null;
  let followUpAt: Date | null;
  let expectedArrivalDate: Date | null;
  try {
    phone = normalizedContactPhone(d.customerId, d.contactPhone);
    budget = validatedBudget(d.budget);
    followUpAt = dateFromBusinessDay(d.followUpDate);
    expectedArrivalDate = dateFromBusinessDay(d.expectedArrivalDate);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid request details" };
  }

  let request;
  try {
    request = await prisma.$transaction(async (tx) => {
      const created = await tx.customerRequest.create({
        data: {
          title: d.title,
          type: d.type,
          description: d.description || null,
          quantity: d.quantity,
          budget,
          priority: d.priority,
          customerId: d.customerId || null,
          contactName: d.customerId ? null : d.contactName || null,
          contactPhone: phone,
          productId: d.productId || null,
          supplierId: d.supplierId || null,
          assignedToUserId: d.assignedToUserId,
          createdByUserId: user.id,
          followUpAt,
          expectedArrivalDate,
          remindBySms: d.remindBySms && Boolean(d.followUpDate),
        },
      });
      await tx.customerRequestEvent.create({
        data: { requestId: created.id, toStatus: "NEW", note: "Request created", createdByUserId: user.id },
      });
      return created;
    });
  } catch (error) {
    console.error("createCustomerRequest failed", error);
    return { error: "Could not save the request. Please try again." };
  }

  revalidateRequestPaths(request.id, request.customerId ?? undefined);
  redirect(`/requests/${request.id}`);
}

export async function updateCustomerRequest(
  id: string,
  _previous: CustomerRequestFormState,
  formData: FormData,
): Promise<CustomerRequestFormState> {
  await requireActionUser();
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  const d = parsed.data;
  if (!d.customerId && !d.contactName && !d.contactPhone) {
    return { error: "Choose a customer or enter a walk-in name or phone number" };
  }

  let phone: string | null;
  let budget: number | null;
  let followUpAt: Date | null;
  let expectedArrivalDate: Date | null;
  try {
    phone = normalizedContactPhone(d.customerId, d.contactPhone);
    budget = validatedBudget(d.budget);
    followUpAt = dateFromBusinessDay(d.followUpDate);
    expectedArrivalDate = dateFromBusinessDay(d.expectedArrivalDate);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid request details" };
  }

  try {
    const previous = await prisma.customerRequest.findUnique({ where: { id }, select: { customerId: true } });
    if (!previous) return { error: "Request not found" };
    await prisma.customerRequest.update({
      where: { id },
      data: {
        title: d.title,
        type: d.type,
        description: d.description || null,
        quantity: d.quantity,
        budget,
        priority: d.priority,
        customerId: d.customerId || null,
        contactName: d.customerId ? null : d.contactName || null,
        contactPhone: phone,
        productId: d.productId || null,
        supplierId: d.supplierId || null,
        assignedToUserId: d.assignedToUserId,
        followUpAt,
        expectedArrivalDate,
        remindBySms: d.remindBySms && Boolean(d.followUpDate),
      },
    });
    revalidateRequestPaths(id, previous.customerId ?? undefined);
    revalidateRequestPaths(id, d.customerId);
  } catch (error) {
    console.error("updateCustomerRequest failed", error);
    return { error: "Could not update the request. Please try again." };
  }
  redirect(`/requests/${id}`);
}

const validStatuses = new Set(REQUEST_STATUS_OPTIONS.map((option) => option.value));

export async function updateCustomerRequestStatus(
  id: string,
  _previous: CustomerRequestStatusState,
  formData: FormData,
): Promise<CustomerRequestStatusState> {
  const user = await requireActionUser();
  const status = formData.get("status") as CustomerRequestStatus;
  const note = String(formData.get("note") ?? "").trim();
  if (!validStatuses.has(status)) return { error: "Invalid status" };

  try {
    const request = await prisma.customerRequest.findUnique({ where: { id }, select: { status: true, customerId: true } });
    if (!request) return { error: "Request not found" };
    if (request.status === status && !note) return { error: "Choose a different status or add a note" };

    await prisma.$transaction([
      prisma.customerRequest.update({
        where: { id },
        data: {
          status,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      }),
      prisma.customerRequestEvent.create({
        data: {
          requestId: id,
          fromStatus: request.status,
          toStatus: status,
          note: note || null,
          createdByUserId: user.id,
        },
      }),
    ]);
    revalidateRequestPaths(id, request.customerId ?? undefined);
    return { success: true };
  } catch (error) {
    console.error("updateCustomerRequestStatus failed", error);
    return { error: "Could not update the request status" };
  }
}
