// Shared query parsing for every search box in the app — list pages, the POS
// product picker, the customer pickers and the command palette all run the
// typed text through `parseSearchQuery` so the same input yields the same
// interpretation everywhere.
//
// Two things this fixes over a raw `contains` on the whole string:
//   1. Multi-word queries. "hon 125" now matches "Honda CB 125" because every
//      token has to match *something*, not the whole phrase in order.
//   2. Intent. An all-digit query is usually a sticker code or a phone number,
//      and a phone typed as "077 123 4567" has to find "0771234567".

import { normalizeLkPhone } from "@/lib/phone";
import { parseShortCode } from "@/lib/product-code";

/** Longest query we bother parsing — keeps a pasted essay from hitting the DB. */
const MAX_QUERY_LENGTH = 100;
/** Cap on tokens so a very wordy query can't build an enormous AND chain. */
const MAX_TOKENS = 6;

export type ParsedQuery = {
  /** Trimmed, length-capped original text. */
  raw: string;
  /** Lowercased whitespace-separated terms, deduped and capped. */
  tokens: string[];
  /** `123` / `#123` — a printed sticker short code. */
  shortCode: number | null;
  /** Canonical `0XXXXXXXXX` when the query looks like a phone number. */
  phone: string | null;
  /** Alphanumeric-only NIC when the query looks like a NIC. */
  nic: string | null;
  /** False when there is nothing worth querying for. */
  isEmpty: boolean;
};

/** Old-format NIC (9 digits + V/X) or new-format (12 digits). */
const NIC_RE = /^(\d{9}[vx]|\d{12})$/;

/** Strip separators so NICs compare regardless of how they were typed. */
export function normalizeNic(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseSearchQuery(input: string | null | undefined): ParsedQuery {
  const raw = (input ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  const tokens = Array.from(
    new Set(
      raw
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
    ),
  ).slice(0, MAX_TOKENS);

  const digits = raw.replace(/\D/g, "");
  // A phone number is 9-12 digits; shorter runs are sticker codes, longer ones
  // are something else entirely (and 12 digits is also a new-format NIC).
  const phone = digits.length >= 9 && digits.length <= 12 ? normalizeLkPhone(raw) : null;

  const nicCandidate = normalizeNic(raw);
  const nic = NIC_RE.test(nicCandidate) ? nicCandidate : null;

  return {
    raw,
    tokens,
    shortCode: parseShortCode(raw),
    phone,
    nic,
    isEmpty: tokens.length === 0,
  };
}

/** Prisma `contains` filter, case-insensitive — the shape every field uses. */
export function contains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

/**
 * Builds the `AND`-of-`OR`s that makes multi-word search work: each token must
 * match at least one of the fields `fieldsFor` returns for it.
 *
 * Callers supply the per-token OR array themselves so relation filters
 * (`{ customer: { name: contains(t) } }`) keep their Prisma types.
 *
 * Returns `undefined` for an empty query so it can be spread into a `where`
 * without adding a no-op clause.
 */
export function tokenMatchWhere<W>(
  tokens: string[],
  fieldsFor: (token: string) => W[],
): { AND: { OR: W[] }[] } | undefined {
  if (tokens.length === 0) return undefined;
  return { AND: tokens.map((token) => ({ OR: fieldsFor(token) })) };
}

/**
 * Relevance score for a candidate row, highest first. The DB narrows with
 * `contains`; this decides what a cashier actually sees in the top few rows.
 *
 * Fields are weighted by how deliberate a match on them is: an exact code is
 * certainly what was meant, a substring hit deep in a description is a guess.
 */
export function scoreMatch(
  query: ParsedQuery,
  fields: { value: string | null | undefined; weight: number }[],
): number {
  const needle = query.raw.toLowerCase();
  let score = 0;

  for (const { value, weight } of fields) {
    if (!value) continue;
    const hay = value.toLowerCase();
    if (hay === needle) score += weight * 8;
    else if (hay.startsWith(needle)) score += weight * 4;
    // Whole-word hit ("brake" in "front brake pad") beats a mid-word one.
    else if (new RegExp(`\\b${escapeRegExp(needle)}`).test(hay)) score += weight * 2;
    else if (hay.includes(needle)) score += weight;

    // Partial credit when the tokens are spread across the field.
    if (query.tokens.length > 1) {
      const hits = query.tokens.filter((t) => hay.includes(t)).length;
      score += (weight * hits) / query.tokens.length;
    }
  }

  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type HighlightRange = { start: number; end: number };

/**
 * Every occurrence of every token within `text`, merged so overlapping hits
 * render as a single mark. Drives <Highlight>: because search is token-based,
 * "hon 125" has to highlight both words, not look for the phrase verbatim.
 */
export function highlightRanges(text: string, tokens: string[]): HighlightRange[] {
  const hay = text.toLowerCase();
  const ranges: HighlightRange[] = [];

  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const idx = hay.indexOf(token, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + token.length });
      from = idx + token.length;
    }
  }

  ranges.sort((a, b) => a.start - b.start);

  const merged: HighlightRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Sorts in place by descending score, keeping the DB order as the tiebreak. */
export function rankByScore<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
