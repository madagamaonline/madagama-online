import Link from "next/link";
import { Plus, Tags, Pencil, Download, Percent, Sticker, X } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { contains, parseSearchQuery, tokenMatchWhere } from "@/lib/search";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum } from "@/lib/utils";
import { grossMarginPct } from "@/lib/pricing";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { getSettings } from "@/lib/settings";
import { ProductCategoryFilter } from "@/components/product-category-filter";
import { toggleProductActive } from "./actions";
import { canonicalUnit, formatQuantity } from "@/lib/units";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; cat?: string; sub?: string }>;
}) {
  const { q, page, cat, sub } = await searchParams;
  const query = (q ?? "").trim();
  // A subcategory already implies its parent, so it wins when both are present.
  const catId = (cat ?? "").trim() || undefined;
  const subId = (sub ?? "").trim() || undefined;
  const ntEnabled = await nonTaxableEnabled();

  // Same parser the POS type-ahead uses, so a query typed here and at the till
  // is interpreted identically (multi-word terms, sticker codes).
  const parsed = parseSearchQuery(query);
  const tokens = tokenMatchWhere<Prisma.ProductWhereInput>(parsed.tokens, (token) => [
    { code: contains(token) },
    { name: contains(token) },
    { barcode: contains(token) },
    { modelNumber: contains(token) },
    { serialNumber: contains(token) },
  ]);
  const where: Prisma.ProductWhereInput = {
    ...productTaxableWhere(ntEnabled),
    // Kept at the top level so it ANDs with the search OR below.
    ...(subId ? { subcategoryId: subId } : catId ? { categoryId: catId } : {}),
    ...(parsed.isEmpty
      ? {}
      : {
          OR: [
            ...(parsed.shortCode !== null ? [{ shortCode: parsed.shortCode }] : []),
            ...(tokens ? [tokens] : []),
          ],
        }),
  };

  const total = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp so a stale/out-of-range page (e.g. after a search narrows results)
  // still lands on a real page instead of an empty table.
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  const [products, settings, session, filterCategories, selectedSub, selectedCat] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { code: "asc" },
      include: { category: true, subcategory: true },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getSettings(),
    getSession(),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    subId
      ? prisma.subcategory.findUnique({
          where: { id: subId },
          select: { id: true, name: true, category: { select: { id: true, name: true } } },
        })
      : null,
    catId && !subId
      ? prisma.category.findUnique({ where: { id: catId }, select: { id: true, name: true } })
      : null,
  ]);
  const defaultTarget = toNum(settings?.defaultTargetMarginPct ?? 20);
  const isAdmin = session?.role === "ADMIN";

  // The active filter, resolved to names for the chip. A stale id (deleted
  // category) resolves to null and simply shows no chip.
  const filterLabel = selectedSub
    ? `${selectedSub.category.name} / ${selectedSub.name}`
    : selectedCat
      ? selectedCat.name
      : null;
  const filterValue = selectedSub ? `sub:${selectedSub.id}` : selectedCat ? `cat:${selectedCat.id}` : "";

  const listHref = (params: { page?: number; cat?: string; sub?: string; keepFilter?: boolean }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (params.keepFilter) {
      if (subId) sp.set("sub", subId);
      else if (catId) sp.set("cat", catId);
    }
    if (params.sub) sp.set("sub", params.sub);
    else if (params.cat) sp.set("cat", params.cat);
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    const qs = sp.toString();
    return qs ? `/products?${qs}` : "/products";
  };
  // Paging must carry the filter, or "Next" would silently widen the list.
  const pageHref = (p: number) => listHref({ page: p, keepFilter: true });

  const rows = products.map((p) => {
    const available = toNum(p.quantityInStock) - toNum(p.quantityReserved);
    const low = toNum(p.reorderLevel) > 0 && available <= toNum(p.reorderLevel);
    const unit = canonicalUnit(p.trackingType);
    const price = toNum(p.sellingPrice);
    const cost = toNum(p.costPrice);
    const marginPct = grossMarginPct(cost, price);
    const target = p.targetMarginPct == null ? defaultTarget : toNum(p.targetMarginPct);
    const belowTarget = cost > 0 && price > 0 && marginPct < target - 0.05;
    return { p, available, low, unit, cost, marginPct, target, belowTarget };
  });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Stock items with auto-generated codes"
        action={
          <div className="flex flex-wrap gap-2">
            <a href="/api/export/stock" className={buttonVariants({ variant: "outline" })}>
              <Download className="h-4 w-4" /> Export
            </a>
            <Link href="/products/labels">
              <Button variant="outline">
                <Sticker className="h-4 w-4" /> Print labels
              </Button>
            </Link>
            {isAdmin && (
              <Link href="/products/pricing">
                <Button variant="outline">
                  <Percent className="h-4 w-4" /> Bulk pricing
                </Button>
              </Link>
            )}
            <Link href="/products/categories">
              <Button variant="outline">
                <Tags className="h-4 w-4" /> Categories
              </Button>
            </Link>
            <Link href="/products/new">
              <Button>
                <Plus className="h-4 w-4" /> New Product
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ListSearch
                placeholder="Search by sticker # (e.g. 12), code, name or barcode…"
                resetParams={["page"]}
                className="relative w-full sm:max-w-md"
              />
              <ProductCategoryFilter categories={filterCategories} current={filterValue} />
            </div>
            {filterLabel && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Filtered to</span>
                <Link
                  href={listHref({})}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 font-medium hover:bg-border-subtle"
                  title="Clear category filter"
                >
                  {filterLabel}
                  <X className="h-3.5 w-3.5 text-muted" />
                </Link>
                <span className="text-muted">
                  {total} product{total === 1 ? "" : "s"}
                </span>
              </div>
            )}
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query || filterLabel
                ? "No products match the current search or filter."
                : "No products yet. Add your first product."}
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <THead>
                    <TR>
                      <TH>#</TH>
                      <TH>Code</TH>
                      <TH>Name</TH>
                      <TH>Model</TH>
                      <TH>Category</TH>
                      <TH className="text-right">Cost (WAC)</TH>
                      <TH className="text-right">Price</TH>
                      <TH className="text-right">Margin</TH>
                      <TH className="text-right">Stock</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map(({ p, available, low, unit, cost, marginPct, target, belowTarget }) => (
                      <TR key={p.id} className={p.active ? "" : "opacity-50"}>
                        <TD className="font-mono text-sm font-bold">
                          <Link href={`/products/${p.id}`} className="text-primary-ink hover:underline">
                            #{p.shortCode}
                          </Link>
                        </TD>
                        <TD className="font-mono text-xs font-semibold">
                          <Link href={`/products/${p.id}`} className="text-primary hover:underline">
                            <Highlight text={p.code} query={query} />
                          </Link>
                        </TD>
                        <TD className="font-medium">
                          <Link
                            href={`/products/${p.id}`}
                            className={`hover:underline ${ntEnabled ? (p.taxable ? "text-success" : "text-danger") : ""}`}
                            title={ntEnabled ? (p.taxable ? "Taxable" : "Non-taxable") : undefined}
                          >
                            <Highlight text={p.name} query={query} />
                          </Link>
                        </TD>
                        <TD className="font-mono text-xs text-muted">
                          {p.modelNumber ? <Highlight text={p.modelNumber} query={query} /> : "—"}
                        </TD>
                        <TD className="text-muted">
                          <Link href={listHref({ cat: p.categoryId })} className="hover:underline">
                            {p.category.name}
                          </Link>
                          {p.subcategory && (
                            <>
                              {" / "}
                              <Link href={listHref({ sub: p.subcategoryId! })} className="hover:underline">
                                {p.subcategory.name}
                              </Link>
                            </>
                          )}
                        </TD>
                        <TD className="text-right text-muted">{formatLKR(cost)}</TD>
                        <TD className="text-right">{formatLKR(p.sellingPrice)}</TD>
                        <TD className="text-right">
                          <span className={marginPct < 0 ? "text-danger" : "text-muted"}>
                            {marginPct.toFixed(0)}%
                          </span>
                          {belowTarget && (
                            <Link href={`/products/${p.id}/edit`} title={`Below ${target.toFixed(0)}% target`}>
                              <Badge tone="amber" className="ml-2">↓ target</Badge>
                            </Link>
                          )}
                        </TD>
                        <TD className="text-right">
                          {low ? (
                            <Badge tone="red">{formatQuantity(available, unit)} low</Badge>
                          ) : (
                            <span>{formatQuantity(available, unit)}{toNum(p.quantityReserved) > 0 && <span className="ml-1 text-xs text-muted">({formatQuantity(toNum(p.quantityReserved), unit)} reserved)</span>}</span>
                          )}
                        </TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/products/${p.id}/edit`}>
                              <Button variant="ghost" size="sm">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <form action={toggleProductActive.bind(null, p.id, !p.active)}>
                              <Button variant="ghost" size="sm" type="submit" className="text-muted">
                                {p.active ? "Disable" : "Enable"}
                              </Button>
                            </form>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>

              <div className="lg:hidden">
                {rows.map(({ p, available, low, unit, marginPct, target, belowTarget }) => (
                  <div
                    key={p.id}
                    className={`border-b border-border-subtle p-4 last:border-0 ${p.active ? "" : "opacity-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
                          <Link href={`/products/${p.id}`} className="font-bold text-primary-ink hover:underline">
                            #{p.shortCode}
                          </Link>
                          <Link href={`/products/${p.id}`} className="font-semibold text-primary hover:underline">
                            <Highlight text={p.code} query={query} />
                          </Link>
                        </div>
                        <Link
                          href={`/products/${p.id}`}
                          className={`mt-0.5 block font-medium hover:underline ${ntEnabled ? (p.taxable ? "text-success" : "text-danger") : ""}`}
                          title={ntEnabled ? (p.taxable ? "Taxable" : "Non-taxable") : undefined}
                        >
                          <Highlight text={p.name} query={query} />
                        </Link>
                        <div className="mt-0.5 text-xs text-muted">
                          <Link href={listHref({ cat: p.categoryId })} className="hover:underline">
                            {p.category.name}
                          </Link>
                          {p.subcategory && (
                            <>
                              {" / "}
                              <Link href={listHref({ sub: p.subcategoryId! })} className="hover:underline">
                                {p.subcategory.name}
                              </Link>
                            </>
                          )}
                          {p.modelNumber && (
                            <>
                              {" · "}
                              <span className="font-mono">
                                <Highlight text={p.modelNumber} query={query} />
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <Link href={`/products/${p.id}/edit`} className="shrink-0">
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-medium">{formatLKR(p.sellingPrice)}</span>
                      <span className={marginPct < 0 ? "text-danger" : "text-muted"}>
                        {marginPct.toFixed(0)}% margin
                      </span>
                      {belowTarget && (
                        <Link href={`/products/${p.id}/edit`} title={`Below ${target.toFixed(0)}% target`}>
                          <Badge tone="amber">↓ target</Badge>
                        </Link>
                      )}
                      {low ? (
                        <Badge tone="red">{formatQuantity(available, unit)} available · low</Badge>
                      ) : (
                        <span className="text-muted">{formatQuantity(available, unit)} available{toNum(p.quantityReserved) ? ` · ${formatQuantity(toNum(p.quantityReserved), unit)} reserved` : ""}</span>
                      )}
                      <form action={toggleProductActive.bind(null, p.id, !p.active)} className="ml-auto">
                        <Button variant="ghost" size="sm" type="submit" className="text-muted">
                          {p.active ? "Disable" : "Enable"}
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-sm">
              <span className="text-muted">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <Link href={pageHref(currentPage - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Previous
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                <span className="px-1 text-muted">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Link href={pageHref(currentPage + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Next
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
