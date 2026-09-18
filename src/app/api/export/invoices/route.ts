import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";
import { toNum } from "@/lib/utils";
import { invoiceTypeLabel, openAccountStatusLabel } from "@/lib/open-account";

export const dynamic = "force-dynamic";

export async function GET() {
  // The full sales ledger — re-check auth here, not just in the proxy.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }
  const invoices = await prisma.invoice.findMany({
    where: { voidedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { name: true } },
      createdBy: { select: { name: true } },
      soldBy: { select: { name: true } },
    },
    take: 5000,
  });

  const csv = toCsv(
    [
      "Invoice #",
      "Date",
      "Type",
      "Category",
      "Customer",
      "Cashier",
      "Salesperson",
      "Status",
      "Subtotal",
      "Discount",
      "Total",
      "Paid",
      "Balance",
    ],
    invoices.map((i) => [
      i.invoiceNumber,
      csvDate(i.createdAt),
      invoiceTypeLabel(i.type),
      i.taxCategory,
      i.customer?.name ?? "Walk-in",
      i.createdBy?.name ?? "",
      i.soldBy?.name ?? "",
      i.type === "OPEN_ACCOUNT" ? openAccountStatusLabel(i.status) : i.status,
      toNum(i.subtotal),
      toNum(i.discount),
      toNum(i.grandTotal),
      toNum(i.amountPaid),
      Math.max(0, toNum(i.grandTotal) - toNum(i.amountPaid)),
    ]),
  );

  return csvResponse(csv, `invoices-${csvDate(new Date())}.csv`);
}
