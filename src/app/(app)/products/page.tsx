import Link from "next/link";
import { Plus, Search, Tags, Pencil, Download, Percent } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR, toNum } from "@/lib/utils";
import { grossMarginPct } from "@/lib/pricing";
import { nonTaxableEnabled, productTaxableWhere } from "@/lib/tax-mode";
import { getSettings } from "@/lib/settings";
import { toggleProductActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const ntEnabled = await nonTaxableEnabled();

  const where: Prisma.ProductWhereInput = {
    ...productTaxableWhere(ntEnabled),
    ...(query
      ? {
          OR: [
            { code: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { barcode: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [products, settings, session] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { code: "asc" },
      include: { category: true, subcategory: true },
      take: 200,
    }),
    getSettings(),
    getSession(),
  ]);
  const defaultTarget = toNum(settings?.defaultTargetMarginPct ?? 20);
  const isAdmin = session?.role === "ADMIN";

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
            <form className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                name="q"
                defaultValue={query}
                placeholder="Search by code, name or barcode…"
                className="pl-9"
              />
            </form>
          </div>

          {products.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted">
              {query ? "No products match your search." : "No products yet. Add your first product."}
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Cost (WAC)</TH>
                  <TH className="text-right">Price</TH>
                  <TH className="text-right">Margin</TH>
                  <TH className="text-right">Stock</TH>
                  {ntEnabled && <TH>Tax</TH>}
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
                      <TD className="font-mono text-xs font-semibold">
                        <Link href={`/products/${p.id}`} className="text-primary hover:underline">
                          {p.code}
                        </Link>
                      </TD>
                      <TD className="font-medium">
                        <Link href={`/products/${p.id}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </TD>
                      <TD className="text-muted">
                        {p.category.name} / {p.subcategory.name}
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
                      {ntEnabled && (
                        <TD>
                          {p.taxable ? <Badge tone="blue">Taxable</Badge> : <Badge>Non-taxable</Badge>}
                        </TD>
                      )}
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
        </CardContent>
      </Card>
    </div>
  );
}
