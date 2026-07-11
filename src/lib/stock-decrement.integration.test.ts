import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { decrementStockForSale } from "./stock-decrement";

const testUrl = process.env.TEST_DATABASE_URL;
const integration = testUrl ? describe : describe.skip;

integration("stock concurrency (isolated PostgreSQL)", () => {
  let db: PrismaClient;
  let categoryId = "";
  let productId = "";

  beforeAll(async () => {
    if (!testUrl) return;
    const parsed = new URL(testUrl);
    const explicitlyTest = parsed.hostname === "localhost" || parsed.pathname.toLowerCase().includes("test");
    if (testUrl === process.env.DATABASE_URL || !explicitlyTest) {
      throw new Error("TEST_DATABASE_URL must point to a separate local or clearly named test database.");
    }
    db = new PrismaClient({ datasources: { db: { url: testUrl } } });
    const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
    const category = await db.category.create({ data: { name: `Concurrency ${suffix}`, code: `T${suffix}` } });
    categoryId = category.id;
    const product = await db.product.create({
      data: {
        code: `TEST-${suffix}`,
        name: "Last unit concurrency test",
        categoryId,
        quantityInStock: 1,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (!db) return;
    if (productId) await db.product.delete({ where: { id: productId } });
    if (categoryId) await db.category.delete({ where: { id: categoryId } });
    await db.$disconnect();
  });

  it("allows only one of two tills to sell the final unit", async () => {
    const sell = () =>
      db.$transaction((tx) =>
        decrementStockForSale(tx, { productId, productCode: "TEST", qty: 1 }),
      );
    const results = await Promise.allSettled([sell(), sell()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(db.product.findUniqueOrThrow({ where: { id: productId } })).resolves.toMatchObject({
      quantityInStock: 0,
    });
  });
});
