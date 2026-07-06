"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Plus, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LabelSheet, LABEL_COLS, type LabelItem } from "./label-sheet";

type Hit = {
  id: string;
  code: string;
  shortCode: number;
  name: string;
  sellingPrice: number;
  stock: number;
};

type Row = {
  id: string;
  code: string;
  shortCode: number;
  name: string;
  sellingPrice: number;
  qty: number;
};

// A single reprint run shouldn't fire off a runaway job.
const MAX_QTY = 200;

/**
 * Reprint a chosen number of stickers for specific products — e.g. when a few
 * printed labels get damaged. Search the catalog, add items, set a count each,
 * and print just those. Self-contained: it renders the only `.print-area` on
 * the page in this mode, so window.print() picks up exactly these labels.
 */
export function ReprintLabels() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [showPrices, setShowPrices] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(async () => {
      if (!q) {
        setHits([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setHits(data.results ?? []);
        setActiveIdx(0);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, q ? 200 : 0);
    return () => clearTimeout(t);
  }, [query]);

  function addProduct(h: Hit) {
    setRows((prev) => {
      const existing = prev.find((r) => r.id === h.id);
      if (existing) {
        return prev.map((r) => (r.id === h.id ? { ...r, qty: Math.min(r.qty + 1, MAX_QTY) } : r));
      }
      return [
        ...prev,
        { id: h.id, code: h.code, shortCode: h.shortCode, name: h.name, sellingPrice: h.sellingPrice, qty: 1 },
      ];
    });
    setQuery("");
    setHits([]);
    setOpen(false);
    setActiveIdx(0);
    searchRef.current?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = hits[activeIdx] ?? hits[0];
      if (pick) addProduct(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setHits([]);
      setOpen(false);
    }
  }

  function setQty(id: string, qty: number) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, qty: Math.max(1, Math.min(qty || 1, MAX_QTY)) } : r)),
    );
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const labels: LabelItem[] = rows.flatMap((r) =>
    Array.from({ length: r.qty }, (_, i) => ({
      key: `${r.id}-${i}`,
      shortCode: r.shortCode,
      name: r.name,
      code: r.code,
      sellingPrice: r.sellingPrice,
    })),
  );

  return (
    <div>
      <div className="no-print space-y-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search by sticker #, code or name to add…"
            className="h-11 pl-10"
          />
          {open && hits.length > 0 && (
            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => addProduct(h)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                    i === activeIdx ? "bg-input" : "hover:bg-input"
                  }`}
                >
                  <span>
                    <span className="font-mono text-xs font-semibold text-primary">#{h.shortCode}</span>{" "}
                    <span className="font-medium">{h.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted">{h.code}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted">
            No items yet. Search above and add the products you need to reprint.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
              >
                <span className="font-mono text-sm font-bold text-primary-ink">#{r.shortCode}</span>
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <span className="font-mono text-xs text-muted">{r.code}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQty(r.id, r.qty - 1)}
                    aria-label="Fewer labels"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    max={MAX_QTY}
                    value={r.qty}
                    onChange={(e) => setQty(r.id, Number(e.target.value))}
                    className="h-9 w-16 text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQty(r.id, r.qty + 1)}
                    aria-label="More labels"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(r.id)}
                  className="text-muted"
                  aria-label="Remove item"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!showPrices} onChange={(e) => setShowPrices(!e.target.checked)} />
            <span className="text-xs font-medium text-muted">Hide prices</span>
          </label>
          <span className="text-xs text-muted">
            {labels.length} label{labels.length === 1 ? "" : "s"} · {LABEL_COLS} per row on A4 — cut along
            the dashed lines
          </span>
        </div>
      </div>

      {labels.length > 0 && <LabelSheet items={labels} showPrices={showPrices} />}
    </div>
  );
}
