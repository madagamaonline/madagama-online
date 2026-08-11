-- Trigram (pg_trgm) indexes for product and customer search.
--
-- Every search in the app filters with a case-insensitive `contains`, which
-- Prisma emits as `ILIKE '%q%'`. A B-tree index cannot serve a leading-wildcard
-- pattern, so each keystroke was sequentially scanning the whole table. A GIN
-- index with `gin_trgm_ops` indexes the three-character substrings and serves
-- ILIKE directly (trigrams are case-folded, so one index covers LIKE and ILIKE).
--
-- Additive only: this creates an extension and indexes. No table is rewritten,
-- no column is added, altered or dropped, and no row is touched. Building an
-- index takes a SHARE lock, which blocks concurrent writes to the table for the
-- duration but never blocks reads. At this data size that is milliseconds.
--
-- Note: queries shorter than three characters cannot use a trigram index and
-- still fall back to a scan. That is expected — short numeric queries are
-- sticker codes, which are served by Product.shortCode's own unique index.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Customer_name_trgm_idx" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Customer_nic_trgm_idx" ON "Customer" USING GIN ("nic" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Customer_phone_trgm_idx" ON "Customer" USING GIN ("phone" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_code_trgm_idx" ON "Product" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_barcode_trgm_idx" ON "Product" USING GIN ("barcode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_modelNumber_trgm_idx" ON "Product" USING GIN ("modelNumber" gin_trgm_ops);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_serialNumber_trgm_idx" ON "Product" USING GIN ("serialNumber" gin_trgm_ops);
