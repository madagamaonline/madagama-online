"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLKR } from "@/lib/utils";

type Datum = {
  label: string;
  total: number;
  taxable?: number;
  nonTaxable?: number;
  highlight?: boolean;
};
type ChartDatum = Datum & { categoryKey: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; dataKey?: string; color?: string; payload?: ChartDatum }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  const split = payload.some((item) => item.dataKey === "taxable" || item.dataKey === "nonTaxable");
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-faint">{datum?.label ?? label}</p>
      {split ? (
        <div className="mt-1 space-y-1 text-xs">
          {payload.map((item) => (
            <div key={item.dataKey} className="flex items-center justify-between gap-4">
              <span style={{ color: item.color }}>{item.name}</span>
              <span className="tabular font-semibold">{formatLKR(item.value ?? 0)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-t border-border pt-1 font-bold">
            <span>Total</span>
            <span className="tabular">{formatLKR(datum?.total ?? 0)}</span>
          </div>
        </div>
      ) : (
        <p className="tabular text-sm font-bold text-foreground">{formatLKR(payload[0]?.value ?? 0)}</p>
      )}
    </div>
  );
}

export function SalesChart({ data, height = 220 }: { data: Datum[]; height?: number }) {
  // Recharts uses the X-axis category to resolve tooltip payloads. Display
  // labels such as "T" and "S" can repeat, so give every point a unique key
  // and format that key back to the human-readable label on the axis.
  const chartData: ChartDatum[] = data.map((datum, index) => ({
    ...datum,
    categoryKey: String(index),
  }));
  const split = chartData.some((datum) => datum.taxable !== undefined || datum.nonTaxable !== undefined);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 12, right: 4, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="salesBarFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="categoryKey"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--color-faint)" }}
          tickFormatter={(_, index) => chartData[index]?.label ?? ""}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11, fill: "var(--color-faint)" }}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <Tooltip cursor={{ fill: "var(--color-border-subtle)", opacity: 0.55 }} content={<ChartTooltip />} />
        {split ? (
          <>
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar name="Taxable" dataKey="taxable" stackId="sales" fill="var(--color-primary)" maxBarSize={48} animationDuration={700} />
            <Bar name="Non-taxable" dataKey="nonTaxable" stackId="sales" fill="var(--color-clay)" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={700} />
          </>
        ) : (
          <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={700}>
            {chartData.map((d) => (
              <Cell key={d.categoryKey} fill={d.highlight ? "var(--color-clay)" : "url(#salesBarFill)"} />
            ))}
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
