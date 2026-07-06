import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { formatLKR } from "@/lib/utils";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";

export const dynamic = "force-dynamic";

// 4 × 45mm columns fit inside the global @page A4 14mm margins (182mm printable).
const COLS = 4;
// Guard against a bad stock count spraying thousands of stickers per product.
const MAX_COPIES_PER_PRODUCT = 50;

export default async function ProductLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; subcategory?: string; prices?: string; perUnit?: string }>;
}) {
  const { category, subcategory, prices, perUnit } = await searchParams;
  const showPrices = prices !== "off";
  const oneLabelPerUnit = perUnit === "on";

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...productTaxableWhere(await nonTaxableEnabled()),
    ...(subcategory ? { subcategoryId: subcategory } : category ? { categoryId: category } : {}),
  };

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { subcategories: { orderBy: { name: "asc" } } },
    }),
    prisma.product.findMany({
      where,
      orderBy: { shortCode: "asc" },
      select: { id: true, code: true, shortCode: true, name: true, sellingPrice: true, quantityInStock: true },
      take: 2000,
    }),
  ]);

  // Expand each product into one label per unit in stock when requested; the
  // stickers are identical (same sticker #), so the cashier can paste one on
  // each physical item. Zero-stock products drop out in per-unit mode.
  const labels = oneLabelPerUnit
    ? products.flatMap((p) => {
        const copies = Math.min(Math.max(p.quantityInStock, 0), MAX_COPIES_PER_PRODUCT);
        return Array.from({ length: copies }, (_, i) => ({ ...p, key: `${p.id}-${i}` }));
      })
    : products.map((p) => ({ ...p, key: p.id }));

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Sticker labels"
          subtitle="Print short-code stickers to paste on products — the cashier types the number at the till"
          action={<PrintButton label="Print labels" />}
        />

        <Card className="mb-4">
          <CardContent className="p-4">
            <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-muted">Category</span>
                <select
                  name="category"
                  defaultValue={category ?? ""}
                  className="h-9 rounded-lg border border-border bg-input px-2"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-muted">Subcategory</span>
                <select
                  name="subcategory"
                  defaultValue={subcategory ?? ""}
                  className="h-9 rounded-lg border border-border bg-input px-2"
                >
                  <option value="">All subcategories</option>
                  {categories.map((c) => (
                    <optgroup key={c.id} label={`${c.code} — ${c.name}`}>
                      {c.subcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex h-9 items-center gap-2">
                <input type="checkbox" name="prices" value="off" defaultChecked={!showPrices} />
                <span className="text-xs font-medium text-muted">Hide prices</span>
              </label>
              <label className="flex h-9 items-center gap-2">
                <input type="checkbox" name="perUnit" value="on" defaultChecked={oneLabelPerUnit} />
                <span className="text-xs font-medium text-muted">One label per stock unit</span>
              </label>
              <Button type="submit" variant="outline">
                Load labels
              </Button>
              <span className="text-xs text-muted">
                {labels.length} label{labels.length === 1 ? "" : "s"} · {COLS} per row on A4 — cut
                along the dashed lines
              </span>
            </form>
          </CardContent>
        </Card>
      </div>

      {labels.length === 0 ? (
        <div className="no-print rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted">
          {oneLabelPerUnit
            ? "No active products with stock match this filter."
            : "No active products match this filter."}
        </div>
      ) : (
        <div
          className="print-area grid bg-surface"
          style={{ gridTemplateColumns: `repeat(${COLS}, 45mm)` }}
        >
          {labels.map((p) => (
            <div
              key={p.key}
              className="flex flex-col justify-between border border-dashed border-border p-[2mm]"
              style={{ width: "45mm", height: "22mm", breakInside: "avoid", overflow: "hidden" }}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="font-mono text-[7mm] font-bold leading-none text-foreground">
                  #{p.shortCode}
                </span>
                {showPrices && (
                  <span className="text-[3mm] font-semibold leading-none">
                    {formatLKR(p.sellingPrice)}
                  </span>
                )}
              </div>
              <div
                className="text-[2.8mm] font-medium leading-tight text-foreground"
                style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {p.name}
              </div>
              <div className="font-mono text-[2.2mm] leading-none text-muted">{p.code}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
