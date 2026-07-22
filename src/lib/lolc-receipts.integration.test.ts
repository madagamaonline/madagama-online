import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { applyLolcReceiptCreate, applyLolcReceiptTransition } from "./lolc-receipts";

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("LOLC receipt workflow (isolated PostgreSQL)", () => {
  let db: PrismaClient;
  let userId = "";
  let receiptId = "";
  const suffix = crypto.randomUUID();

  const accountingState = async () => ({
    invoices: (await db.invoice.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, grandTotal: true, amountPaid: true } })).map((row) => ({ ...row, grandTotal: row.grandTotal.toString(), amountPaid: row.amountPaid.toString() })),
    payments: (await db.payment.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    expenses: (await db.expense.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    purchases: (await db.purchase.findMany({ orderBy: { id: "asc" }, select: { id: true, total: true } })).map((row) => ({ ...row, total: row.total.toString() })),
    purchasePayments: (await db.purchasePayment.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    bankAccounts: await db.bankAccount.findMany({ orderBy: { id: "asc" }, select: { id: true, updatedAt: true } }),
    cheques: (await db.issuedCheque.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true, updatedAt: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    chequePayments: (await db.chequePayment.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    stockMovements: await db.stockMovement.findMany({ orderBy: { id: "asc" }, select: { id: true, qty: true, balanceAfter: true } }),
    vehiclePayments: (await db.vehicleCustomerPayment.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    vehicleSettlements: (await db.vehicleSupplierSettlement.findMany({ orderBy: { id: "asc" }, select: { id: true, amount: true } })).map((row) => ({ ...row, amount: row.amount.toString() })),
    shiftReports: (await db.shiftReport.findMany({ orderBy: { id: "asc" }, select: { id: true, expectedCash: true, actualCash: true } })).map((row) => ({ ...row, expectedCash: row.expectedCash.toString(), actualCash: row.actualCash.toString() })),
  });

  beforeAll(async () => {
    if (!testUrl) return;
    const parsed = new URL(testUrl);
    if (testUrl === process.env.DATABASE_URL || !(parsed.hostname === "localhost" || parsed.pathname.toLowerCase().includes("test"))) {
      throw new Error("TEST_DATABASE_URL must point to a separate local or clearly named test database.");
    }
    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const user = await db.user.create({ data: { name: "LOLC Test Admin", email: `lolc-${suffix}@test.local`, passwordHash: "test", role: "ADMIN" } });
    userId = user.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.lolcReceipt.deleteMany({ where: { submissionKey: suffix } });
    if (userId) await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  it("is idempotent, guards transitions, preserves snapshots/events, and stays off-ledger", async () => {
    const before = await accountingState();
    const base = new Date();
    const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000);
    const create = () => db.$transaction((tx) => applyLolcReceiptCreate(tx, {
      submissionKey: suffix,
      customerName: "Test Customer",
      customerPhone: "0771234567",
      lolcCode: `AG-${suffix.slice(0, 8)}`,
      amount: 12500,
      collectedAt: at(-1440),
      note: "Original immutable note",
      actorUserId: userId,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const creates = await Promise.allSettled([create(), create()]);
    expect(creates.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const receipt = await db.lolcReceipt.findUniqueOrThrow({ where: { submissionKey: suffix } });
    receiptId = receipt.id;
    const issuedSnapshot = {
      customerName: receipt.customerName,
      customerPhone: receipt.customerPhone,
      lolcCode: receipt.lolcCode,
      amount: receipt.amount.toString(),
      collectedAt: receipt.collectedAt.toISOString(),
      note: receipt.note,
    };

    const send = (key: string) => db.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId,
      expectedStatuses: ["COLLECTED"],
      toStatus: "MCASH_SENT",
      eventType: "MCASH_SENT",
      occurredAt: at(1),
      actorUserId: userId,
      idempotencyKey: key,
      reference: "MC-1001",
      update: { mCashReference: "MC-1001", remittedAt: at(1), remittedByUserId: userId },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const sends = await Promise.allSettled([send(`${suffix}:send-1`), send(`${suffix}:send-2`)]);
    expect(sends.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    await db.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId,
      expectedStatuses: ["MCASH_SENT"],
      toStatus: "NEEDS_ATTENTION",
      eventType: "ISSUE_REPORTED",
      occurredAt: at(2),
      actorUserId: userId,
      idempotencyKey: `${suffix}:issue`,
      note: "Not visible on agreement",
      update: { issueNote: "Not visible on agreement" },
    }));
    await db.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId,
      expectedStatuses: ["NEEDS_ATTENTION"],
      toStatus: "LOLC_CONFIRMED",
      eventType: "LOLC_CONFIRMED",
      occurredAt: at(3),
      actorUserId: userId,
      idempotencyKey: `${suffix}:confirm`,
      note: "Verified in LOLC portal",
      update: { confirmedAt: at(3), confirmedByUserId: userId, issueNote: null },
    }));
    await db.$transaction((tx) => applyLolcReceiptTransition(tx, {
      receiptId,
      expectedStatuses: ["LOLC_CONFIRMED"],
      toStatus: "VOIDED",
      eventType: "VOIDED",
      occurredAt: at(4),
      actorUserId: userId,
      idempotencyKey: `${suffix}:void`,
      note: "Test correction",
      update: { voidReason: "Test correction", voidedAt: at(4), voidedByUserId: userId },
    }));

    const final = await db.lolcReceipt.findUniqueOrThrow({ where: { id: receiptId }, include: { events: { orderBy: { occurredAt: "asc" } } } });
    expect(final.status).toBe("VOIDED");
    expect(final.events.map((event) => event.type)).toEqual(["CREATED", "MCASH_SENT", "ISSUE_REPORTED", "LOLC_CONFIRMED", "VOIDED"]);
    expect({
      customerName: final.customerName,
      customerPhone: final.customerPhone,
      lolcCode: final.lolcCode,
      amount: final.amount.toString(),
      collectedAt: final.collectedAt.toISOString(),
      note: final.note,
    }).toEqual(issuedSnapshot);
    expect(await accountingState()).toEqual(before);
  });
});
