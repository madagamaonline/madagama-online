import { Fragment } from "react";
import { highlightRanges, parseSearchQuery } from "@/lib/search";

/**
 * Highlights the searched terms within `text`. Search is token-based — "hon 125"
 * matches "Honda CB 125" — so this highlights each token wherever it appears
 * rather than looking for the whole query as one substring.
 *
 * Server-safe (pure render).
 */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const { tokens } = parseSearchQuery(query);
  if (tokens.length === 0) return <>{text}</>;

  const ranges = highlightRanges(text, tokens);
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, i) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={i} className="rounded-[3px] bg-clay-soft px-0.5 text-clay-ink">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
