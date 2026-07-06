"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductFormState } from "@/app/(app)/products/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Textarea } from "@/components/ui/textarea";
import { PricingHelper } from "@/components/pricing-helper";

type Sub = { id: string; name: string; code: string; categoryId: string };
type Category = { id: string; name: string; code: string; subcategories: Sub[] };
type Supplier = { id: string; name: string };

export type ProductInitial = {
  code?: string;
  name: string;
  categoryId: string;
  subcategoryId: string;
  costPrice: number;
  sellingPrice: number;
  targetMarginPct: number | null;
  quantityInStock: number;
  reorderLevel: number;
  taxable: boolean;
  barcode: string;
  modelNumber: string;
  serialNumber: string;
  primarySupplierId: string;
  description: string;
};

const empty: ProductInitial = {
  name: "",
  categoryId: "",
  subcategoryId: "",
  costPrice: 0,
  sellingPrice: 0,
  targetMarginPct: null,
  quantityInStock: 0,
  reorderLevel: 0,
  taxable: true,
  barcode: "",
  modelNumber: "",
  serialNumber: "",
  primarySupplierId: "",
  description: "",
};

export function ProductForm({
  categories,
  suppliers,
  action,
  initial = empty,
  submitLabel = "Save Product",
  isEdit = false,
  nonTaxableEnabled = true,
  defaultTargetMarginPct = 20,
}: {
  categories: Category[];
  suppliers: Supplier[];
  action: (prev: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initial?: ProductInitial;
  submitLabel?: string;
  isEdit?: boolean;
  nonTaxableEnabled?: boolean;
  defaultTargetMarginPct?: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, {});
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  // Controlled so the searchable pickers drive it and switching category clears
  // a now-invalid subcategory. Submitted via a hidden input (SearchSelect is a
  // button, not a native form field).
  const [subcategoryId, setSubcategoryId] = useState(initial.subcategoryId);
  const [supplierId, setSupplierId] = useState(initial.primarySupplierId);

  // Controlled so the live pricing helper can react to edits and write back the
  // suggested selling price. Kept as strings to allow an empty target margin.
  const [costPrice, setCostPrice] = useState(String(initial.costPrice ?? ""));
  const [sellingPrice, setSellingPrice] = useState(String(initial.sellingPrice ?? ""));
  const [targetMargin, setTargetMargin] = useState(
    initial.targetMarginPct == null ? "" : String(initial.targetMarginPct),
  );

  const subs = categories.find((c) => c.id === categoryId)?.subcategories ?? [];

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5">
          {state.error && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{state.error}</div>
          )}

          {initial.code && (
            <div className="rounded-lg bg-input px-3 py-2 text-sm">
              Product code: <b>{initial.code}</b>{" "}
              <span className="text-muted">(generated automatically)</span>
            </div>
          )}

          <div>
            <Label htmlFor="name">Product name</Label>
            <Input id="name" name="name" defaultValue={initial.name} required />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="modelNumber">Model number (optional)</Label>
              <Input id="modelNumber" name="modelNumber" defaultValue={initial.modelNumber} />
            </div>
            <div>
              <Label htmlFor="serialNumber">Serial number (optional)</Label>
              <Input id="serialNumber" name="serialNumber" defaultValue={initial.serialNumber} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">Category</Label>
              {/* SearchSelect is a button, not a form field — carry the value here. */}
              <input type="hidden" name="categoryId" value={categoryId} />
              <SearchSelect
                options={categories.map((c) => ({ value: c.id, label: c.name, hint: c.code }))}
                value={categoryId}
                onChange={(v) => {
                  setCategoryId(v);
                  // Drop a subcategory that no longer belongs to the new category.
                  const stillValid = categories
                    .find((c) => c.id === v)
                    ?.subcategories.some((s) => s.id === subcategoryId);
                  if (!stillValid) setSubcategoryId("");
                }}
                placeholder="Select category…"
                searchPlaceholder="Search categories…"
                emptyText="No categories match."
              />
            </div>
            <div>
              <Label htmlFor="subcategoryId">Subcategory (optional)</Label>
              {/* SearchSelect is a button, not a form field — carry the value here. */}
              <input type="hidden" name="subcategoryId" value={subcategoryId} />
              <SearchSelect
                options={[
                  { value: "", label: "— No subcategory" },
                  ...subs.map((s) => ({ value: s.id, label: s.name, hint: s.code })),
                ]}
                value={subcategoryId}
                onChange={setSubcategoryId}
                disabled={!categoryId}
                placeholder={categoryId ? "No subcategory" : "Select a category first"}
                searchPlaceholder="Search subcategories…"
                emptyText="No subcategories match."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="costPrice">Cost price (LKR)</Label>
              <NumberInput
                id="costPrice"
                name="costPrice"
                value={costPrice}
                onValueChange={setCostPrice}
              />
            </div>
            <div>
              <Label htmlFor="sellingPrice">Selling price (LKR)</Label>
              <NumberInput
                id="sellingPrice"
                name="sellingPrice"
                value={sellingPrice}
                onValueChange={setSellingPrice}
                required
              />
            </div>
            <div>
              <Label htmlFor="targetMarginPct">Target margin %</Label>
              <Input
                id="targetMarginPct"
                name="targetMarginPct"
                type="number"
                step="0.1"
                min="0"
                max="99"
                placeholder={`${defaultTargetMarginPct} (default)`}
                value={targetMargin}
                onChange={(e) => setTargetMargin(e.target.value)}
              />
            </div>
          </div>

          <PricingHelper
            cost={Number(costPrice) || 0}
            price={Number(sellingPrice) || 0}
            targetMarginPct={Number(targetMargin) || 0}
            defaultTargetMarginPct={defaultTargetMarginPct}
            onApplyPrice={(p) => setSellingPrice(String(p))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {isEdit ? (
                <>
                  <Label>Current stock</Label>
                  <div className="flex h-11 items-center rounded-xl border border-input-border bg-input px-4 text-sm">
                    {initial.quantityInStock}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Stock changes through Purchases and Sales — not here.
                  </p>
                </>
              ) : (
                <>
                  <Label htmlFor="quantityInStock">Opening stock (one-time)</Label>
                  <Input id="quantityInStock" name="quantityInStock" type="number" min="0" defaultValue={initial.quantityInStock} />
                  <p className="mt-1 text-xs text-muted">
                    Starting count. After this, add stock through Purchases.
                  </p>
                </>
              )}
            </div>
            <div>
              <Label htmlFor="reorderLevel">Low-stock alert level</Label>
              <Input id="reorderLevel" name="reorderLevel" type="number" min="0" defaultValue={initial.reorderLevel} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="barcode">Barcode (optional)</Label>
              <Input id="barcode" name="barcode" defaultValue={initial.barcode} />
            </div>
            <div>
              <Label htmlFor="primarySupplierId">Primary supplier (optional)</Label>
              {/* SearchSelect is a button, not a form field — carry the value here. */}
              <input type="hidden" name="primarySupplierId" value={supplierId} />
              <SearchSelect
                options={[
                  { value: "", label: "— No supplier" },
                  ...suppliers.map((s) => ({ value: s.id, label: s.name })),
                ]}
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Select supplier…"
                searchPlaceholder="Search suppliers…"
                emptyText="No suppliers match."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" defaultValue={initial.description} />
          </div>

          {nonTaxableEnabled && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="taxable"
                defaultChecked={initial.taxable}
                className="h-4 w-4 rounded border-border"
              />
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
