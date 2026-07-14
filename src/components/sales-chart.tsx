"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatLKR } from "@/lib/utils";

type Datum = { label: string; total: number; highlight?: boolean };
type ChartDatum = Datum & { categoryKey: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: ChartDatum }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0];
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-faint">{datum?.payload?.label ?? label}</p>
      <p className="tabular text-sm font-bold text-foreground">{formatLKR(datum?.value ?? 0)}</p>
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
        <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={700}>
          {chartData.map((d) => (
            <Cell key={d.categoryKey} fill={d.highlight ? "var(--color-clay)" : "url(#salesBarFill)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
