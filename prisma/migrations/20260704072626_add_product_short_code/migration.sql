-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "shortCode" SERIAL NOT NULL;

-- Backfill existing products in catalog (code) order so sticker numbers run
-- shelf-by-shelf, then bump the sequence past the highest assigned number.
-- Must happen BEFORE the unique index exists (renumbering swaps values).
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY code) AS rn FROM "Product"
)
UPDATE "Product" p SET "shortCode" = o.rn FROM ordered o WHERE p.id = o.id;

SELECT setval(
  pg_get_serial_sequence('"Product"', 'shortCode'),
  GREATEST((SELECT COALESCE(MAX("shortCode"), 0) FROM "Product"), 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_shortCode_key" ON "Product"("shortCode");
