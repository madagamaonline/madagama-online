import { describe, expect, it } from "vitest";
import { highlightRanges, normalizeNic, parseSearchQuery, rankByScore, scoreMatch, tokenMatchWhere } from "@/lib/search";

describe("parseSearchQuery", () => {
  it("treats blank input as empty", () => {
    for (const input of ["", "   ", null, undefined]) {
      expect(parseSearchQuery(input).isEmpty).toBe(true);
    }
  });

  it("splits multi-word queries into tokens", () => {
    expect(parseSearchQuery("  Honda  CB 125 ").tokens).toEqual(["honda", "cb", "125"]);
  });

  it("dedupes tokens and caps the count", () => {
    expect(parseSearchQuery("red red").tokens).toEqual(["red"]);
    expect(parseSearchQuery("a b c d e f g h").tokens).toHaveLength(6);
  });

  it("reads a sticker short code with or without the hash", () => {
    expect(parseSearchQuery("123").shortCode).toBe(123);
    expect(parseSearchQuery("#7").shortCode).toBe(7);
    expect(parseSearchQuery("AGR-0001").shortCode).toBeNull();
  });

  it("normalises a phone number however it is typed", () => {
    for (const input of ["0771234567", "077 123 4567", "077-123-4567", "94771234567", "771234567"]) {
      expect(parseSearchQuery(input).phone).toBe("0771234567");
    }
  });

  it("does not read a short digit run as a phone number", () => {
    expect(parseSearchQuery("123").phone).toBeNull();
  });

  it("recognises both NIC formats and ignores separators", () => {
    expect(parseSearchQuery("123456789V").nic).toBe("123456789v");
    expect(parseSearchQuery("1234-5678-9012").nic).toBe("123456789012");
    expect(parseSearchQuery("brake pad").nic).toBeNull();
  });

  it("caps a pasted essay", () => {
    expect(parseSearchQuery("x".repeat(500)).raw).toHaveLength(100);
  });
});

describe("normalizeNic", () => {
  it("strips separators and lowercases", () => {
    expect(normalizeNic("12 345-6789 V")).toBe("123456789v");
  });
});

describe("tokenMatchWhere", () => {
  it("returns undefined for no tokens so it can be spread into a where", () => {
    expect(tokenMatchWhere([], () => [])).toBeUndefined();
  });

  it("requires every token to match one of the fields", () => {
    const where = tokenMatchWhere(["hon", "125"], (t) => [{ name: t }]);
    expect(where).toEqual({
      AND: [{ OR: [{ name: "hon" }] }, { OR: [{ name: "125" }] }],
    });
  });
});

describe("scoreMatch", () => {
  const score = (query: string, value: string) =>
    scoreMatch(parseSearchQuery(query), [{ value, weight: 1 }]);

  it("ranks exact over prefix over word-start over mid-word", () => {
    expect(score("brake", "brake")).toBeGreaterThan(score("brake", "brake pad"));
    expect(score("brake", "brake pad")).toBeGreaterThan(score("brake", "front brake pad"));
    expect(score("brake", "front brake pad")).toBeGreaterThan(score("brake", "airbrakepad"));
  });

  it("scores nothing when the field does not match", () => {
    expect(score("brake", "clutch cable")).toBe(0);
  });

  it("gives credit when the tokens are spread across the field", () => {
    expect(score("hon 125", "Honda CB 125")).toBeGreaterThan(0);
  });

  it("ignores null fields", () => {
    expect(scoreMatch(parseSearchQuery("x"), [{ value: null, weight: 5 }])).toBe(0);
  });

  it("treats regex characters in the query as literal text", () => {
    expect(() => score("a+b(", "a+b(c")).not.toThrow();
    expect(score("a+b(", "a+b(c")).toBeGreaterThan(0);
  });
});

describe("highlightRanges", () => {
  const ranges = (text: string, query: string) =>
    highlightRanges(text, parseSearchQuery(query).tokens).map((r) => text.slice(r.start, r.end));

  it("highlights each token, not the phrase verbatim", () => {
    expect(ranges("Honda CB 125", "hon 125")).toEqual(["Hon", "125"]);
  });

  it("highlights every occurrence of a token", () => {
    expect(ranges("pad brake pad", "pad")).toEqual(["pad", "pad"]);
  });

  it("merges overlapping token hits into one range", () => {
    expect(ranges("brakes", "brake brakes")).toEqual(["brakes"]);
  });

  it("returns nothing when no token matches", () => {
    expect(ranges("clutch cable", "brake")).toEqual([]);
  });

  it("is case-insensitive but preserves the original casing", () => {
    expect(ranges("REFRIGERATOR", "refrigerator")).toEqual(["REFRIGERATOR"]);
  });
});

describe("rankByScore", () => {
  it("sorts by score and keeps the original order as the tiebreak", () => {
    const items = [
      { id: "a", score: 1 },
      { id: "b", score: 3 },
      { id: "c", score: 1 },
    ];
    expect(rankByScore(items, (i) => i.score).map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});
