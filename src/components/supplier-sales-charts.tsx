"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatLKR } from "@/lib/utils";

type DailyPoint = { day: string; netSales: number; grossProfit: number };
type ProductPoint = { productName: string; productCode: string; netSales: number; grossProfit: number };

const axis = { fontSize: 11, fill: "var(--color-faint)" };
const compactMoney = (value: number) => Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}m` : Math.abs(value) >= 1_000 ? `${Math.round(value / 1_000)}k` : String(value);

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; payload?: ProductPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const product = payload[0]?.payload;
  return (
    <div className="max-w-72 rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      <p className="mb-1 text-xs font-bold text-foreground">{product?.productName ?? label}</p>
      {product?.productCode && <p className="mb-2 font-mono text-[10px] text-faint">{product.productCode}</p>}
      {payload.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-6 text-xs"><span style={{ color: entry.color }}>{entry.name}</span><span className="font-mono font-bold tabular-nums">{formatLKR(entry.value ?? 0)}</span></div>)}
    </div>
  );
}

export function SupplierDailyTrendChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 3, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-subtle)" />
        <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compactMoney} width={48} />
        <Tooltip content={<MoneyTooltip />} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
        <Line type="monotone" dataKey="netSales" name="Net sales" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="grossProfit" name="Gross profit" stroke="var(--color-success, #2f855a)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SupplierTopProductsChart({ data }: { data: ProductPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 10, left: 12, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border-subtle)" />
        <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={compactMoney} />
        <YAxis type="category" dataKey="productCode" tick={axis} tickLine={false} axisLine={false} width={104} />
        <Tooltip cursor={{ fill: "var(--color-border-subtle)", opacity: 0.5 }} content={<MoneyTooltip />} />
        <Bar dataKey="netSales" name="Net sales" fill="var(--color-primary)" radius={[0, 5, 5, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
