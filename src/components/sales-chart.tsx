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

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-faint">{label}</p>
      <p className="tabular text-sm font-bold text-foreground">{formatLKR(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export function SalesChart({ data, height = 220 }: { data: Datum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id="salesBarFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--color-faint)" }}
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
          {data.map((d, i) => (
            <Cell key={i} fill={d.highlight ? "var(--color-clay)" : "url(#salesBarFill)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
