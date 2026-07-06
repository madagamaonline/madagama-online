import Link from "next/link";
import { Plus, Tags, Pencil, Download, Percent, Sticker } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearch } from "@/components/list-search";
import { Highlight } from "@/components/highlight";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum } from "@/lib/utils";
import { grossMarginPct } from "@/lib/pricing";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { getSettings } from "@/lib/settings";
import { parseShortCode } from "@/lib/product-code";
import { toggleProductActive } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const query = (q ?? "").trim();
  const ntEnabled = await nonTaxableEnabled();

  const shortCode = parseShortCode(query);
  const where: Prisma.ProductWhereInput = {
    ...productTaxableWhere(ntEnabled),
    ...(query
      ? {
          OR: [
            ...(shortCode !== null ? [{ shortCode }] : []),
            { code: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { barcode: { contains: query, mode: "insensitive" } },
            { modelNumber: { contains: query, mode: "insensitive" } },
            { serialNumber: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const total = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Clamp so a stale/out-of-range page (e.g. after a search narrows results)
  // still lands on a real page instead of an empty table.
  const currentPage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  const [products, settings, session] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { code: "asc" },
      include: { category: true, subcategory: true },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    getSettings(),
    getSession(),
  ]);
  const defaultTarget = toNum(settings?.defaultTargetMarginPct ?? 20);
  const isAdmin = session?.role === "ADMIN";

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/products?${qs}` : "/products";
  };

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Stock items with auto-generated codes"
        action={
          <div className="flex gap-2">
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
          <div className="border-b border-border p-4">
            <ListSearch
              placeholder="Search by sticker # (e.g. 12), code, name or barcode…"
              resetParams={["page"]}
            />
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query ? "No products match your search." : "No products yet. Add your first product."}
            </div>
          ) : (
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
                {products.map((p) => {
                  const low = p.reorderLevel > 0 && p.quantityInStock <= p.reorderLevel;
                  const price = toNum(p.sellingPrice);
                  const cost = toNum(p.costPrice);
                  const marginPct = grossMarginPct(cost, price);
                  const target = p.targetMarginPct == null ? defaultTarget : toNum(p.targetMarginPct);
                  const belowTarget = cost > 0 && price > 0 && marginPct < target - 0.05;
                  return (
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
                        {p.category.name}
                        {p.subcategory ? ` / ${p.subcategory.name}` : ""}
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
                          <Badge tone="red">{p.quantityInStock} low</Badge>
                        ) : (
                          p.quantityInStock
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
                  );
                })}
              </TBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm">
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
