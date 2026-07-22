import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const voidInvoiceSchema = z.object({
  invoiceId: z.string().min(1, "Invoice is required."),
  reason: z.string().trim().min(3, "Please enter a reason of at least 3 characters.").max(500, "Reason must be 500 characters or fewer."),
});

export type VoidEligibility = {
  returns: number;
  serviceJobs: number;
  missingProducts: number;
  payments: number;
  interestCharges: number;
  closedShift: boolean;
};

export function voidEligibilityError(e: VoidEligibility): string | null {
  if (e.returns) return "This invoice has a sales return and cannot be voided.";
  if (e.serviceJobs) return "This invoice is linked to a service or warranty job and cannot be voided.";
  if (e.missingProducts) return "One or more invoice items no longer link to a product, so stock cannot be restored safely.";
  if (e.payments || e.interestCharges) return "This credit sale has payment or interest activity and cannot be voided.";
  if (e.closedShift) return "This invoice is included in a completed shift report and cannot be voided.";
  return null;
}

export class VoidInvoiceError extends Error {}

export async function applyInvoiceVoid(
  tx: Prisma.TransactionClient,
  input: { invoiceId: string; reason: string; adminId: string; now?: Date },
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      createdAt: true,
      voidedAt: true,
      items: { select: { productId: true, qty: true } },
      _count: { select: { returns: true, serviceJobs: true } },
      creditAgreement: {
        select: { id: true, _count: { select: { payments: true, interestCharges: true } } },
      },
      openAccount: { select: { id: true, _count: { select: { payments: true } } } },
    },
  });
  if (!invoice) throw new VoidInvoiceError("Invoice not found.");
  if (invoice.voidedAt) throw new VoidInvoiceError("This invoice has already been voided.");

  const closedShift = await tx.shiftReport.count({
    where: { startTime: { lte: invoice.createdAt }, endTime: { gte: invoice.createdAt } },
  });
  const blocker = voidEligibilityError({
    returns: invoice._count.returns,
    serviceJobs: invoice._count.serviceJobs,
    missingProducts: invoice.items.filter((item) => !item.productId).length,
    payments: (invoice.creditAgreement?._count.payments ?? 0) + (invoice.openAccount?._count.payments ?? 0),
    interestCharges: invoice.creditAgreement?._count.interestCharges ?? 0,
    closedShift: closedShift > 0,
  });
  if (blocker) throw new VoidInvoiceError(blocker);

  const claimed = await tx.invoice.updateMany({
    where: { id: invoice.id, voidedAt: null },
    data: {
      voidedAt: input.now ?? new Date(),
      voidReason: input.reason,
      voidedByUserId: input.adminId,
    },
  });
  if (claimed.count !== 1) throw new VoidInvoiceError("This invoice has already been voided.");

  if (invoice.creditAgreement) {
    await tx.creditAgreement.update({
      where: { id: invoice.creditAgreement.id },
      data: { status: "VOIDED" },
    });
  }
  if (invoice.openAccount) {
    await tx.openAccount.update({ where: { id: invoice.openAccount.id }, data: { status: "VOIDED" } });
  }

  for (const item of [...invoice.items].sort((a, b) =>
    (a.productId ?? "").localeCompare(b.productId ?? ""),
  )) {
    const productId = item.productId!;
    const product = await tx.product.update({
      where: { id: productId },
      data: { quantityInStock: { increment: item.qty } },
      select: { quantityInStock: true },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        type: "SALE_VOID",
        qty: item.qty,
        balanceAfter: product.quantityInStock,
        reason: input.reason,
        refId: invoice.id,
        createdByUserId: input.adminId,
      },
    });
  }
}
