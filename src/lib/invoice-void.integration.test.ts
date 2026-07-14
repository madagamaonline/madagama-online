import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { applyInvoiceVoid } from "./invoice-void";

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("invoice void reversal (isolated PostgreSQL)", () => {
  let db: PrismaClient;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    if (!testUrl) return;
    const parsed = new URL(testUrl);
    if (testUrl === process.env.DATABASE_URL || !(parsed.hostname === "localhost" || parsed.pathname.toLowerCase().includes("test"))) {
      throw new Error("TEST_DATABASE_URL must point to a separate local or clearly named test database.");
    }
    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const user = await db.user.create({ data: { name: "Void Admin", email: `void-${suffix}@test.local`, passwordHash: "test", role: "ADMIN" } });
    const category = await db.category.create({ data: { name: `Void ${suffix}`, code: `V${suffix}` } });
    const product = await db.product.create({ data: { code: `VOID-${suffix}`, name: "Void test item", categoryId: category.id, quantityInStock: 7 } });
    const customer = await db.customer.create({ data: { name: "Void Customer", phone: `070${suffix.slice(0, 7)}` } });
    const guarantor = await db.guarantor.create({ data: { name: "Void Guarantor", nic: suffix, phone: "0710000000" } });
    const invoice = await db.invoice.create({
      data: {
        invoiceNumber: `TEST-VOID-${suffix}`,
        type: "CREDIT",
        status: "CREDIT",
        customerId: customer.id,
        subtotal: 300,
        grandTotal: 300,
        items: { create: { productId: product.id, nameSnapshot: product.name, codeSnapshot: product.code, qty: 3, unitPrice: 100, lineTotal: 300 } },
      },
    });
    const agreement = await db.creditAgreement.create({ data: { invoiceId: invoice.id, customerId: customer.id, guarantorId: guarantor.id, principal: 300, startDate: new Date(), interestRatePerMonth: 0.02, interestFreeMonths: 4 } });
    Object.assign(ids, { user: user.id, category: category.id, product: product.id, customer: customer.id, guarantor: guarantor.id, invoice: invoice.id, agreement: agreement.id });
  });

  afterAll(async () => {
    if (!db) return;
    await db.stockMovement.deleteMany({ where: { refId: ids.invoice } });
    if (ids.agreement) await db.creditAgreement.delete({ where: { id: ids.agreement } });
    if (ids.invoice) await db.invoice.delete({ where: { id: ids.invoice } });
    if (ids.guarantor) await db.guarantor.delete({ where: { id: ids.guarantor } });
    if (ids.customer) await db.customer.delete({ where: { id: ids.customer } });
    if (ids.product) await db.product.delete({ where: { id: ids.product } });
    if (ids.category) await db.category.delete({ where: { id: ids.category } });
    if (ids.user) await db.user.delete({ where: { id: ids.user } });
    await db.$disconnect();
  });

  it("restores stock once, appends an audit movement, and voids linked credit", async () => {
    const run = () => db.$transaction(
      (tx) => applyInvoiceVoid(tx, { invoiceId: ids.invoice, reason: "Duplicate sale", adminId: ids.user }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.product.findUniqueOrThrow({ where: { id: ids.product } })).toMatchObject({ quantityInStock: 10 });
    expect(await db.creditAgreement.findUniqueOrThrow({ where: { id: ids.agreement } })).toMatchObject({ status: "VOIDED" });
    const movements = await db.stockMovement.findMany({ where: { refId: ids.invoice, type: "SALE_VOID" } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ qty: 3, balanceAfter: 10, reason: "Duplicate sale", createdByUserId: ids.user });
  });
});
