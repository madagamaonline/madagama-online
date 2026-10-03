import { businessDayKey } from "./dates";

type Cell = string | number | null | undefined;

function escape(v: Cell): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string. A UTF-8 BOM is prepended so Excel opens it correctly. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return "﻿" + lines.join("\r\n");
}

/** Wrap CSV text in a downloadable Response. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Calendar date in the business timezone, so late-night sales keep their day. */
export const csvDate = (d: Date): string => businessDayKey(d);
