-- Additive only: stock batches (one per purchase line) with their own cost and
-- selling price, plus the link from each sold invoice line to the batches it
-- consumed. No existing column or row is changed.

CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "label" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qtyReceived" DECIMAL(16,4) NOT NULL,
    "qtyRemaining" DECIMAL(16,4) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceItemBatch" (
    "id" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "qty" DECIMAL(16,4) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "qtyRestored" DECIMAL(16,4) NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItemBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockBatch_purchaseItemId_key" ON "StockBatch"("purchaseItemId");
CREATE INDEX "StockBatch_productId_receivedAt_idx" ON "StockBatch"("productId", "receivedAt");
CREATE INDEX "InvoiceItemBatch_invoiceItemId_idx" ON "InvoiceItemBatch"("invoiceItemId");
CREATE INDEX "InvoiceItemBatch_batchId_idx" ON "InvoiceItemBatch"("batchId");

ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceItemBatch" ADD CONSTRAINT "InvoiceItemBatch_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceItemBatch" ADD CONSTRAINT "InvoiceItemBatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: split each product's current stock into batches. Stock on hand is
-- assumed to be the most recently purchased units (oldest sold first), so the
-- newest purchase lines fill first; whatever stock the purchase history cannot
-- explain becomes one "Opening stock" batch at the product's current cost.
-- Every batch starts at the product's current selling price.
WITH lines AS (
    SELECT
        pi."id" AS "purchaseItemId",
        pi."productId",
        pi."qty",
        pi."costPrice",
        pu."date" AS "receivedAt",
        p."quantityInStock" AS "stock",
        p."sellingPrice",
        COALESCE(SUM(pi."qty") OVER (
            PARTITION BY pi."productId"
            ORDER BY pu."date" DESC, pu."createdAt" DESC, pi."id" DESC
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS "newerQty"
    FROM "PurchaseItem" pi
    JOIN "Purchase" pu ON pu."id" = pi."purchaseId"
    JOIN "Product" p ON p."id" = pi."productId"
    WHERE p."quantityInStock" > 0
)
INSERT INTO "StockBatch" ("id", "productId", "purchaseItemId", "receivedAt", "qtyReceived", "qtyRemaining", "costPrice", "sellingPrice")
SELECT
    'sb' || replace(gen_random_uuid()::text, '-', ''),
    "productId",
    "purchaseItemId",
    "receivedAt",
    "qty",
    LEAST("qty", "stock" - "newerQty"),
    "costPrice",
    "sellingPrice"
FROM lines
WHERE "stock" - "newerQty" > 0;

INSERT INTO "StockBatch" ("id", "productId", "label", "receivedAt", "qtyReceived", "qtyRemaining", "costPrice", "sellingPrice")
SELECT
    'sb' || replace(gen_random_uuid()::text, '-', ''),
    p."id",
    'Opening stock',
    p."createdAt",
    p."quantityInStock" - COALESCE(b."qty", 0),
    p."quantityInStock" - COALESCE(b."qty", 0),
    p."costPrice",
    p."sellingPrice"
FROM "Product" p
LEFT JOIN (
    SELECT "productId", SUM("qtyRemaining") AS "qty" FROM "StockBatch" GROUP BY "productId"
) b ON b."productId" = p."id"
WHERE p."quantityInStock" - COALESCE(b."qty", 0) > 0;
