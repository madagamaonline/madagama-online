import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";
import { toNum } from "@/lib/utils";
import { nonTaxableEnabled, invoiceTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

export async function GET() {
  // The full sales ledger — re-check auth here, not just in the proxy.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }
  // When non-taxable is off, the export contains taxable invoices only and drops
  // the Category column entirely — no NT traces in the file.
  const ntEnabled = await nonTaxableEnabled();
  const invoices = await prisma.invoice.findMany({
    where: { ...invoiceTaxableWhere(ntEnabled) },
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
      ...(ntEnabled ? ["Category"] : []),
      "Customer",
      "Cashier",
      "Salesperson",
      "Status",
      "Subtotal",
      "Discount",
      "Total",
      "Paid",
    ],
    invoices.map((i) => [
      i.invoiceNumber,
      csvDate(i.createdAt),
      i.type,
      ...(ntEnabled ? [i.taxCategory] : []),
      i.customer?.name ?? "Walk-in",
      i.createdBy?.name ?? "",
      i.soldBy?.name ?? "",
      i.status,
      toNum(i.subtotal),
      toNum(i.discount),
      toNum(i.grandTotal),
      toNum(i.amountPaid),
    ]),
  );

  return csvResponse(csv, `invoices-${csvDate(new Date())}.csv`);
}
