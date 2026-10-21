import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), productFindMany: vi.fn(),
  user: { id: "staff", role: "STAFF" },
}));
vi.mock("./prisma", () => ({ prisma: { $transaction: mocks.transaction, product: { findMany: mocks.productFindMany } } }));
vi.mock("./auth", () => ({ requireActionUser: async () => mocks.user, requireActionStaffFinanceAccess: async () => mocks.user, requireActionAdmin: async () => mocks.user }));
vi.mock("./tax-mode", () => ({ nonTaxableEnabled: async () => true, purchaseTaxableWhere: () => ({}) }));
import { createReturn } from "@/app/(app)/returns/actions";
import { createCashInvoice, createOpenAccountSale } from "@/app/(app)/invoices/actions";
import { createSupplierReturn } from "@/app/(app)/supplier-returns/actions";
import { createPurchase } from "@/app/(app)/purchases/actions";
import { recordVehicleCustomerPayment } from "@/app/(app)/vehicle-sales/actions";
import { cashRefundAmount } from "./returns";

function fixture() {
  const invoice = { voidedAt: null, grandTotal: 800, items: [{ productId: "p", qty: 1, unitPrice: 1000, unitDiscount: 0, costSnapshot: 600, unit: "EACH" }], returns: [] };
  const purchase = { id: "purchase", supplierId: "supplier", total: 1000, amountPaid: 100, items: [{ productId: "p", qty: 1, costPrice: 200, unit: "EACH" }], returns: [] as { items: { productId: string; qty: number; lineTotal: number }[] }[] };
  const tx = {
    invoice: { findUnique: vi.fn().mockResolvedValue(invoice), update: vi.fn() },
    creditAgreement: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    openAccount: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    openAccountPayment: { create: vi.fn() },
    payment: { create: vi.fn() },
    salesReturn: { create: vi.fn().mockResolvedValue({ id: "return" }) },
    supplierReturn: { create: vi.fn().mockResolvedValue({ id: "supplier-return" }) },
    purchase: { findFirst: vi.fn().mockResolvedValue(purchase), update: vi.fn(), create: vi.fn().mockResolvedValue({ id: "new-purchase", date: new Date("2026-10-01"), items: [{ id: "new-item", productId: "p" }] }) },
    product: { findMany: vi.fn().mockResolvedValue([{ id: "p", costPrice: 600, trackingType: "PIECE" }]), findUnique: vi.fn().mockResolvedValue({ quantityInStock: 10, quantityReserved: 0, costPrice: 100, sellingPrice: 200 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ quantityInStock: 9 }), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn().mockResolvedValue({ quantityInStock: 11 }) },
    stockMovement: { create: vi.fn() }, priceChange: { create: vi.fn() },
    stockBatch: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    invoiceItemBatch: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn(), update: vi.fn() },
    invoiceItem: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
  };
  return { invoice, purchase, tx };
}
const returnInput = { invoiceId: "invoice", method: "CASH" as const, lines: [{ productId: "p", qty: 1, unitPrice: 9999 }] };
const supplierInput = { purchaseId: "purchase", method: "REDUCE_PAYABLE" as const, lines: [{ productId: "p", qty: 1, unitCost: 9999 }] };
beforeEach(() => { vi.clearAllMocks(); });

describe("customer return actions with an isolated database mock", () => {
  it("persists a discounted refund using server-derived values", async () => {
    const { tx } = fixture(); mocks.transaction.mockImplementation(async (work) => work(tx));
    expect(await createReturn(returnInput)).toMatchObject({ ok: true });
    expect(tx.salesReturn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalRefund: 800, cashRefund: 800, balanceCredit: 0 }) }));
    expect(tx.salesReturn.create.mock.calls[0][0].data.items.create[0].lineTotal).toBe(800);
  });
  it.each(["formal", "pay-later"])("records both portions of a %s return", async (kind) => {
    const { invoice, tx } = fixture(); invoice.grandTotal = 1000;
    const now = new Date();
    if (kind === "formal") tx.creditAgreement.findUnique.mockResolvedValue({ id: "credit", invoiceId: "invoice", status: "ACTIVE", principal: 1000, startDate: now, interestRatePerMonth: 0, interestFreeMonths: 4, payments: [{ amount: 800, discount: 0, paidDate: now }] });
    else tx.openAccount.findUnique.mockResolvedValue({ id: "open", invoiceId: "invoice", status: "ACTIVE", principal: 1000, payments: [{ amount: 800, method: "CASH" }] });
    mocks.transaction.mockImplementation(async (work) => work(tx));
    expect(await createReturn(returnInput)).toMatchObject({ ok: true, creditedToBalance: 200 });
    const data = tx.salesReturn.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ totalRefund: 1000, cashRefund: 800, balanceCredit: 200, method: "MIXED" });
    expect(cashRefundAmount(data)).toBe(800);
    const payment = kind === "formal" ? tx.payment.create : tx.openAccountPayment.create;
    expect(payment).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 200, method: "RETURN" }) }));
  });
  it("rejects fractional pieces before creating any refund", async () => {
    const { tx } = fixture(); mocks.transaction.mockImplementation(async (work) => work(tx));
    expect(await createReturn({ ...returnInput, lines: [{ ...returnInput.lines[0], qty: 0.5 }] })).toMatchObject({ ok: false });
    expect(tx.salesReturn.create).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});

describe("damaged returns and exchanges", () => {
  it("records a damaged item without putting it back into stock", async () => {
    const { tx } = fixture(); mocks.transaction.mockImplementation(async (work) => work(tx));
    expect(await createReturn({ ...returnInput, lines: [{ ...returnInput.lines[0], restock: false }] })).toMatchObject({ ok: true });
    expect(tx.salesReturn.create.mock.calls[0][0].data.items.create[0].restocked).toBe(false);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  function exchangeTx(stock: number) {
    const { invoice, tx } = fixture();
    const saleTx = {
      ...tx,
      $queryRaw: vi.fn().mockResolvedValue([{ value: BigInt(1) }]),
      saleGroup: { create: vi.fn().mockResolvedValue({ id: "group" }) },
      invoice: {
        ...tx.invoice,
        // The invoice-number collision check looks up by number; the return looks up by id.
        findUnique: vi.fn().mockImplementation(async (args: { where: { invoiceNumber?: string } }) => (args.where.invoiceNumber ? null : invoice)),
        create: vi.fn().mockResolvedValue({ id: "new-invoice" }),
      },
      product: { ...tx.product, findUnique: vi.fn().mockResolvedValue({ quantityInStock: stock + 1, quantityReserved: 0 }) },
    };
    mocks.productFindMany.mockResolvedValue([{ id: "p", code: "P", name: "Grinder", taxable: false, quantityInStock: stock, quantityReserved: 0, costPrice: 600, trackingType: "PIECE", primarySupplierId: null, primarySupplier: null }]);
    mocks.transaction.mockImplementation(async (work) => work(saleTx));
    return saleTx;
  }

  it("saves the return and the new sale together, linking the credit to the checkout", async () => {
    const tx = exchangeTx(0);
    const result = await createCashInvoice({
      lines: [{ productId: "p", qty: 1, unitPrice: 1000 }],
      exchange: { invoiceId: "invoice", lines: [{ productId: "p", qty: 1, restock: true }] },
    });
    // Like-for-like swap works with an empty shelf because the returned unit is restocked first.
    expect(result).toMatchObject({ ok: true, saleGroupId: "group", exchange: { returnId: "return", credit: 800 } });
    const ret = tx.salesReturn.create.mock.calls[0][0].data;
    expect(ret).toMatchObject({ method: "EXCHANGE", cashRefund: 800, exchangeSaleGroupId: "group" });
    expect(tx.product.update.mock.invocationCallOrder[0]).toBeLessThan(tx.product.updateMany.mock.invocationCallOrder[0]);
  });

  it("refuses an exchange on a Pay Later sale", async () => {
    exchangeTx(5);
    expect(await createOpenAccountSale({
      customerId: "c",
      lines: [{ productId: "p", qty: 1, unitPrice: 1000 }],
      exchange: { invoiceId: "invoice", lines: [{ productId: "p", qty: 1, restock: true }] },
    })).toMatchObject({ ok: false });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("supplier return and purchase transactions", () => {
  it("ignores submitted costs and credits the current transaction balance", async () => {
    const { tx, purchase } = fixture(); purchase.amountPaid = 400;
    mocks.transaction.mockImplementation(async (work) => work(tx));
    expect(await createSupplierReturn(supplierInput)).toMatchObject({ ok: true });
    expect(tx.purchase.update).toHaveBeenCalledWith({ where: { id: "purchase" }, data: { amountPaid: 600, status: "PARTIAL" } });
    expect(tx.supplierReturn.create.mock.calls[0][0].data.totalValue).toBe(200);
    expect(mocks.transaction.mock.calls[0][1].isolationLevel).toBe("Serializable");
  });
  it.each(["unrelated", "returned", "duplicate"])("rejects %s product lines", async (kind) => {
    const { tx, purchase } = fixture();
    if (kind === "returned") purchase.returns = [{ items: [{ productId: "p", qty: 1, lineTotal: 200 }] }];
    mocks.transaction.mockImplementation(async (work) => work(tx));
    const lines = kind === "unrelated" ? [{ ...supplierInput.lines[0], productId: "other" }] : kind === "duplicate" ? [...supplierInput.lines, ...supplierInput.lines] : supplierInput.lines;
    expect(await createSupplierReturn({ ...supplierInput, lines })).toMatchObject({ ok: false });
    expect(tx.supplierReturn.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
  it("retries purchases with fresh stock and cost after a serialization conflict", async () => {
    const first = fixture().tx, second = fixture().tx;
    first.product.findUnique.mockResolvedValue({ quantityInStock: 100, quantityReserved: 0, costPrice: 100, sellingPrice: 500 });
    second.product.findUnique.mockResolvedValue({ quantityInStock: 110, quantityReserved: 0, costPrice: 109.09, sellingPrice: 500 });
    mocks.productFindMany.mockResolvedValue([{ id: "p", trackingType: "PIECE", taxable: true }]);
    mocks.transaction.mockImplementationOnce(async (work) => { await work(first); throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" }); }).mockImplementationOnce(async (work) => work(second));
    expect(await createPurchase({ supplierId: "supplier", type: "CASH", lines: [{ productId: "p", qty: 10, costPrice: 300 }] })).toMatchObject({ ok: true });
    expect(second.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: { quantityInStock: { increment: 10 }, costPrice: 125, sellingPrice: 500 } }));
    // The purchase line becomes its own batch at the price actually paid.
    expect(second.stockBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: "p", purchaseItemId: "new-item", qtyRemaining: 10, costPrice: 300, sellingPrice: 500 }) });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("vehicle payment action", () => {
  it.each([500, 200])("validates backdated payment %s against later receipts", async (amount) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
    try {
      const tx = {
        vehicleSale: { findUnique: vi.fn().mockResolvedValue({ type: "IN_HOUSE_CREDIT", status: "ACTIVE", creditAgreement: { id: "credit", status: "ACTIVE", principal: 1000, startDate: new Date("2026-08-01"), interestRatePerMonth: 0, interestFreeMonths: 4 }, payments: [{ amount: 800, kind: "INSTALLMENT", method: "CASH", paidDate: new Date("2026-09-10"), createdAt: new Date("2026-09-10"), recordedByUserId: "staff" }] }), update: vi.fn() },
        vehicleCustomerPayment: { create: vi.fn() }, vehicleCreditAgreement: { update: vi.fn() },
      };
      mocks.transaction.mockImplementation(async (work) => work(tx));
      const form = new FormData(); form.set("amount", String(amount)); form.set("method", "CASH"); form.set("paidDate", "2026-09-09");
      const result = await recordVehicleCustomerPayment("sale", {}, form);
      if (amount === 500) { expect(result.error).toContain("overpay"); expect(tx.vehicleCustomerPayment.create).not.toHaveBeenCalled(); }
      else { expect(result.ok).toBe(true); expect(tx.vehicleCreditAgreement.update).toHaveBeenCalledWith({ where: { id: "credit" }, data: { status: "SETTLED" } }); }
    } finally { vi.useRealTimers(); }
  });
});
