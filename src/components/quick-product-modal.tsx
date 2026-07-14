"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackagePlus, X } from "lucide-react";
import { quickCreateProduct } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { SearchSelect } from "@/components/ui/search-select";
import { cn } from "@/lib/utils";

type Subcategory = { id: string; name: string; code: string; categoryId: string };
export type QuickProductCategory = {
  id: string;
  name: string;
  code: string;
  subcategories: Subcategory[];
};

type CreatedProduct = { id: string; code: string; name: string; costPrice: number; stock: number };

export function QuickProductModal({
  initialName,
  categories,
  supplierId,
  supplierName,
  nonTaxableEnabled,
  onClose,
  onSuccess,
}: {
  initialName: string;
  categories: QuickProductCategory[];
  supplierId: string;
  supplierName?: string;
  nonTaxableEnabled: boolean;
  onClose: () => void;
  onSuccess: (product: CreatedProduct) => void;
}) {
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [taxable, setTaxable] = useState(true);
  const [modelNumber, setModelNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const subcategories = categories.find((category) => category.id === categoryId)?.subcategories ?? [];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!name.trim()) return setError("Product name is required.");
    if (!categoryId) return setError("Select a category.");
    if (sellingPrice === "") return setError("Enter a selling price.");

    startTransition(async () => {
      const result = await quickCreateProduct({
        name,
        categoryId,
        subcategoryId: subcategoryId || undefined,
        sellingPrice: Number(sellingPrice),
        taxable,
        modelNumber,
        barcode,
        primarySupplierId: supplierId || undefined,
      });
      if (!result.ok) return setError(result.error);
      onSuccess(result.product);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-product-title"
        aria-describedby="quick-product-description"
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl animate-in fade-in zoom-in-95 duration-150 sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="absolute right-4 top-4 rounded-full p-1 text-muted transition-colors hover:bg-border-subtle hover:text-foreground disabled:opacity-50"
          aria-label="Close quick add product"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 id="quick-product-title" className="pr-8 text-base font-bold text-foreground">
          Quick Add Product
        </h2>
        <p id="quick-product-description" className="mt-0.5 text-xs text-muted">
          Create the product now. Its stock stays at zero until this purchase is saved.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="quick-product-name">Product name</Label>
            <Input
              id="quick-product-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Samsung 43-inch Smart TV"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <SearchSelect
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                  hint: category.code,
                }))}
                value={categoryId}
                onChange={(value) => {
                  setCategoryId(value);
                  setSubcategoryId("");
                }}
                placeholder="Select category…"
                searchPlaceholder="Search categories…"
                emptyText="No categories match."
              />
            </div>
            <div>
              <Label>Subcategory (optional)</Label>
              <SearchSelect
                options={[
                  { value: "", label: "— No subcategory" },
                  ...subcategories.map((subcategory) => ({
                    value: subcategory.id,
                    label: subcategory.name,
                    hint: subcategory.code,
                  })),
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

          <div>
            <Label htmlFor="quick-product-price">Selling price (LKR)</Label>
            <NumberInput
              id="quick-product-price"
              value={sellingPrice}
              onValueChange={setSellingPrice}
              placeholder="0.00"
              required
            />
          </div>

          {nonTaxableEnabled && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">Tax classification</legend>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: true, label: "Taxable", description: "Include in taxable sales" },
                  { value: false, label: "Non-taxable", description: "Exclude from taxable sales" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={taxable === option.value}
                    onClick={() => setTaxable(option.value)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30",
                      taxable === option.value
                        ? "border-primary bg-primary-soft text-primary-ink"
                        : "border-input-border bg-input text-foreground hover:border-border",
                    )}
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="quick-product-model">Model number (optional)</Label>
              <Input
                id="quick-product-model"
                value={modelNumber}
                onChange={(event) => setModelNumber(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="quick-product-barcode">Barcode (optional)</Label>
              <Input
                id="quick-product-barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
              />
            </div>
          </div>

          {supplierId && (
            <p className="rounded-lg bg-input px-3 py-2 text-xs text-muted">
              Primary supplier: <span className="font-semibold text-foreground">{supplierName}</span>
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              {pending ? "Creating…" : "Create Product"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
