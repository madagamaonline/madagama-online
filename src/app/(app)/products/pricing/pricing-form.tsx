"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatLKR } from "@/lib/utils";
import {
  previewBulkPricing,
  applyBulkPricing,
  type BulkPreviewResult,
  type BulkPricingInput,
} from "./actions";

type Cat = { id: string; name: string; subcategories: { id: string; name: string }[] };
type Supplier = { id: string; name: string };
type AdjustType = "APPLY_TARGET_MARGIN" | "PERCENT_CHANGE" | "FIXED_CHANGE";

export function BulkPricingForm({
  categories,
  suppliers,
  defaultTargetMarginPct,
}: {
  categories: Cat[];
  suppliers: Supplier[];
  defaultTargetMarginPct: number;
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [type, setType] = useState<AdjustType>("APPLY_TARGET_MARGIN");
  const [value, setValue] = useState("");
  const [round, setRound] = useState(true);

  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subs = categories.find((c) => c.id === categoryId)?.subcategories ?? [];
  const needsValue = type !== "APPLY_TARGET_MARGIN";
  const hasFilter = Boolean(categoryId || subcategoryId || supplierId);

  function currentInput(): BulkPricingInput {
    return {
      categoryId: categoryId || undefined,
      subcategoryId: subcategoryId || undefined,
      supplierId: supplierId || undefined,
      type,
      value: needsValue ? Number(value) || 0 : 0,
      round,
    };
  }

  function runPreview() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await previewBulkPricing(currentInput());
      setPreview(res);
      if (!res.ok) setError(res.error);
    });
  }

  function runApply() {
    setError(null);
    setDone(null);
    startTransition(async () => {
      const res = await applyBulkPricing(currentInput());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(`Updated ${res.updated} product${res.updated === 1 ? "" : "s"}.`);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5">
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}
          {done && (
            <div className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">{done}</div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                id="category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubcategoryId("");
                  setPreview(null);
                }}
              >
                <option value="">Any</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                id="subcategory"
                value={subcategoryId}
                disabled={!categoryId}
                onChange={(e) => {
                  setSubcategoryId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Any</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select
                id="supplier"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Any</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="type">Adjustment</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as AdjustType);
                  setPreview(null);
                }}
              >
                <option value="APPLY_TARGET_MARGIN">
                  Apply target margin (default {defaultTargetMarginPct}%)
                </option>
                <option value="PERCENT_CHANGE">Increase / decrease by %</option>
                <option value="FIXED_CHANGE">Add / subtract fixed LKR</option>
              </Select>
            </div>
            {needsValue && (
              <div>
                <Label htmlFor="value">
                  {type === "PERCENT_CHANGE" ? "Percent (use −5 to reduce)" : "Amount LKR (use −50 to reduce)"}
                </Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setPreview(null);
                  }}
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={round}
              onChange={(e) => {
                setRound(e.target.checked);
                setPreview(null);
              }}
              className="h-4 w-4 rounded border-border"
            />
            Round new prices to the nearest 5 LKR
          </label>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" disabled={!hasFilter || pending} onClick={runPreview}>
              {pending ? "Working…" : "Preview"}
            </Button>
            {preview?.ok && preview.changed > 0 && (
              <Button type="button" disabled={pending} onClick={runApply}>
                Apply to {preview.changed} product{preview.changed === 1 ? "" : "s"}
              </Button>
            )}
          </div>
          {!hasFilter && (
            <p className="text-xs text-muted">Pick a category, subcategory or supplier to begin.</p>
          )}
        </CardContent>
      </Card>

      {preview?.ok && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4 text-sm">
              <span>
                <b>{preview.total}</b> match · <b>{preview.changed}</b> will change
              </span>
              {preview.truncated && <Badge tone="amber">Showing first 500</Badge>}
            </div>
            {preview.rows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted">No products match.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Name</TH>
                    <TH className="text-right">Old price</TH>
                    <TH className="text-right">New price</TH>
                    <TH className="text-right">Margin</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.rows.map((r) => {
                    const changed = r.newPrice !== r.oldPrice;
                    return (
                      <TR key={r.id} className={changed ? "" : "opacity-50"}>
                        <TD className="font-mono text-xs font-semibold">{r.code}</TD>
                        <TD className="font-medium">{r.name}</TD>
                        <TD className="text-right text-muted">{formatLKR(r.oldPrice)}</TD>
                        <TD className="text-right font-medium">
                          {formatLKR(r.newPrice)}
                          {r.belowCost && (
                            <Badge tone="red" className="ml-2">
                              below cost
                            </Badge>
                          )}
                        </TD>
                        <TD
                          className={`text-right ${r.newMarginPct < 0 ? "text-danger" : "text-muted"}`}
                        >
                          {r.oldMarginPct.toFixed(0)}% → {r.newMarginPct.toFixed(0)}%
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
