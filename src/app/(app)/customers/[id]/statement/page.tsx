import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { computeCreditState } from "@/lib/credit";
import { formatLKR, formatDate, formatDateTime, toNum } from "@/lib/utils";
import { computeOpenAccountState } from "@/lib/open-account";

export const dynamic = "force-dynamic";

export default async function CustomerStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [customer, setting] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        creditAgreements: {
          where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } },
          orderBy: { startDate: "asc" },
          include: { invoice: { select: { invoiceNumber: true } }, payments: { orderBy: { paidDate: "asc" } } },
        },
        openAccounts: { where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } }, orderBy: { openedAt: "asc" }, include: { invoice: { select: { invoiceNumber: true } }, payments: { orderBy: { paidDate: "asc" } } } },
      },
    }),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  if (!customer) notFound();

  const rows = customer.creditAgreements.map((a) => {
    const state = computeCreditState(
      {
        principal: toNum(a.principal),
        startDate: a.startDate,
        interestRatePerMonth: toNum(a.interestRatePerMonth),
        interestFreeMonths: a.interestFreeMonths,
      },
      a.payments.map((p) => ({ amount: toNum(p.amount), discount: toNum(p.discount), paidDate: p.paidDate })),
    );
    return { a, state };
  });

  const totalPrincipal = rows.reduce((s, r) => s + r.state.principal, 0);
  const totalInterest = rows.reduce((s, r) => s + r.state.interestAccrued, 0);
  const totalPaid = rows.reduce((s, r) => s + r.state.totalPaid, 0);
  const totalDiscount = rows.reduce((s, r) => s + r.state.totalDiscount, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.state.outstanding, 0);
  const openRows = customer.openAccounts.map((a) => ({ a, state: computeOpenAccountState(toNum(a.principal), a.payments.map((p) => ({ amount: toNum(p.amount), method: p.method })), a.dueDate) }));
  const openOutstanding = openRows.reduce((sum, row) => sum + row.state.outstanding, 0);

  const payments = customer.creditAgreements
    .flatMap((a) => a.payments.map((p) => ({ ...p, invoiceNumber: a.invoice.invoiceNumber })))
    .sort((x, y) => x.paidDate.getTime() - y.paidDate.getTime());

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/customers/${customer.id}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <div className="print-area rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-xl font-bold">{setting?.businessName ?? "Madagama Pvt Ltd"}</h1>
            {setting?.address && <p className="text-sm text-muted">{setting.address}</p>}
            {setting?.phone && <p className="text-sm text-muted">Tel: {setting.phone}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-lg font-semibold">STATEMENT OF ACCOUNT</h2>
            <p className="text-sm text-muted">{formatDate(new Date())}</p>
          </div>
        </div>

        <div className="py-6 text-sm">
          <p className="mb-1 font-medium text-muted">Customer</p>
          <p className="font-medium">{customer.name}</p>
          <p className="text-muted">{customer.phone}</p>
          {customer.nic && <p className="text-muted">NIC: {customer.nic}</p>}
          {customer.address && <p className="text-muted">{customer.address}</p>}
        </div>

        <h3 className="mb-2 text-sm font-semibold">Credit agreements</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No credit agreements on record.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-muted">
                <th className="py-2 pr-2 font-medium">Invoice</th>
                <th className="py-2 pr-2 font-medium">Start</th>
                <th className="px-2 text-right font-medium">Principal</th>
                <th className="px-2 text-right font-medium">Interest</th>
                <th className="px-2 text-right font-medium">Paid</th>
                <th className="px-2 text-right font-medium">Discount</th>
                <th className="py-2 pl-2 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, state }) => (
                <tr key={a.id} className="border-b border-border">
                  <td className="py-2 pr-2 font-medium">{a.invoice.invoiceNumber}</td>
                  <td className="py-2 pr-2 text-muted">{formatDate(a.startDate)}</td>
                  <td className="px-2 text-right">{formatLKR(state.principal)}</td>
                  <td className="px-2 text-right">{formatLKR(state.interestAccrued)}</td>
                  <td className="px-2 text-right">{formatLKR(state.totalPaid)}</td>
                  <td className="px-2 text-right">{formatLKR(state.totalDiscount)}</td>
                  <td className="py-2 pl-2 text-right font-medium">{formatLKR(state.outstanding)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 pr-2" colSpan={2}>Totals</td>
                <td className="px-2 text-right">{formatLKR(totalPrincipal)}</td>
                <td className="px-2 text-right">{formatLKR(totalInterest)}</td>
                <td className="px-2 text-right">{formatLKR(totalPaid)}</td>
                <td className="px-2 text-right">{formatLKR(totalDiscount)}</td>
                <td className="py-2 pl-2 text-right">{formatLKR(totalOutstanding)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {payments.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Payment history</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-left text-muted">
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Invoice</th>
                  <th className="py-2 pr-2 font-medium">Method</th>
                  <th className="py-2 pl-2 text-right font-medium">Amount</th>
                  <th className="py-2 pl-2 text-right font-medium">Discount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border">
                    <td className="py-2 pr-2 text-muted">{formatDateTime(p.paidDate)}</td>
                    <td className="py-2 pr-2">{p.invoiceNumber}</td>
                    <td className="py-2 pr-2 text-muted">{p.method}</td>
                    <td className="py-2 pl-2 text-right">{formatLKR(p.amount)}</td>
                    <td className="py-2 pl-2 text-right">{formatLKR(p.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h3 className="mb-2 mt-6 text-sm font-semibold">Pay Later accounts</h3>
        {openRows.length === 0 ? <p className="text-sm text-muted">No Pay Later accounts on record.</p> : <table className="w-full text-sm"><thead><tr className="border-y border-border text-left text-muted"><th className="py-2">Invoice</th><th>Opened</th><th>Promised</th><th className="text-right">Original</th><th className="text-right">Paid / credited</th><th className="text-right">Outstanding</th></tr></thead><tbody>{openRows.map(({ a, state }) => <tr key={a.id} className="border-b border-border"><td className="py-2 font-medium">{a.invoice.invoiceNumber}</td><td>{formatDate(a.openedAt)}</td><td>{a.dueDate ? formatDate(a.dueDate) : "—"}</td><td className="text-right">{formatLKR(state.principal)}</td><td className="text-right">{formatLKR(state.credited)}</td><td className="text-right font-medium">{formatLKR(state.outstanding)}</td></tr>)}</tbody></table>}
        {openRows.some(({ a }) => a.payments.length > 0) && <><h3 className="mb-2 mt-6 text-sm font-semibold">Pay Later payment history</h3><table className="w-full text-sm"><thead><tr className="border-y border-border text-left text-muted"><th className="py-2">Date</th><th>Invoice</th><th>Method</th><th>Note</th><th className="text-right">Amount</th></tr></thead><tbody>{openRows.flatMap(({ a }) => a.payments.map((p) => ({ ...p, invoiceNumber: a.invoice.invoiceNumber }))).sort((a,b) => a.paidDate.getTime() - b.paidDate.getTime()).map((p) => <tr key={p.id} className="border-b border-border"><td className="py-2">{formatDateTime(p.paidDate)}</td><td>{p.invoiceNumber}</td><td>{p.method === "RETURN" ? "Return credit" : p.method}</td><td>{p.note ?? "—"}</td><td className="text-right">{formatLKR(p.amount)}</td></tr>)}</tbody></table></>}

        <div className="mt-6 flex justify-end">
          <div className="w-64 border-t border-border pt-2">
            <div className="flex justify-between text-base font-semibold">
              <span>Combined outstanding</span>
              <span>{formatLKR(totalOutstanding + openOutstanding)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
