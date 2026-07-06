import { formatLKR } from "@/lib/utils";

// 4 × 45mm columns fit inside the global @page A4 14mm margins (182mm printable).
export const LABEL_COLS = 4;

export type LabelItem = {
  key: string;
  shortCode: number;
  name: string;
  code: string;
  sellingPrice: number | string;
};

/** A single 45×22mm sticker. All text is pure black so it prints solid. */
export function ProductLabel({
  shortCode,
  name,
  code,
  sellingPrice,
  showPrices,
}: Omit<LabelItem, "key"> & { showPrices: boolean }) {
  return (
    <div
      className="flex flex-col justify-between border border-dashed border-border p-[2mm]"
      style={{ width: "45mm", height: "22mm", breakInside: "avoid", overflow: "hidden" }}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-mono text-[7mm] font-bold leading-none text-black">#{shortCode}</span>
        {showPrices && (
          <span className="text-[3mm] font-semibold leading-none text-black">{formatLKR(sellingPrice)}</span>
        )}
      </div>
      <div
        className="text-[2.8mm] font-medium leading-tight text-black"
        style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {name}
      </div>
      <div className="font-mono text-[2.2mm] leading-none text-black">{code}</div>
    </div>
  );
}

/** The printable grid of stickers, shared by the category and reprint modes. */
export function LabelSheet({ items, showPrices }: { items: LabelItem[]; showPrices: boolean }) {
  return (
    <div
      className="print-area grid bg-surface"
      style={{ gridTemplateColumns: `repeat(${LABEL_COLS}, 45mm)` }}
    >
      {items.map((p) => (
        <ProductLabel
          key={p.key}
          shortCode={p.shortCode}
          name={p.name}
          code={p.code}
          sellingPrice={p.sellingPrice}
          showPrices={showPrices}
        />
      ))}
    </div>
  );
}
