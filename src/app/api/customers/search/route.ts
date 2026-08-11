import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { contains, parseSearchQuery, rankByScore, scoreMatch, tokenMatchWhere } from "@/lib/search";

/** Rows fetched before ranking — a wider net than we return, so the sort has room. */
const CANDIDATE_LIMIT = 40;
/** Rows actually returned to the picker. */
const RESULT_LIMIT = 12;

type CustomerRow = { id: string; name: string; phone: string; nic: string | null };

function serialize(c: CustomerRow) {
  return { id: c.id, name: c.name, phone: c.phone, nic: c.nic };
}

const SELECT = { id: true, name: true, phone: true, nic: true } as const;

/**
 * Customer type-ahead for the POS, credit, layaway and service-job pickers.
 * These used to receive the whole customer table (capped at 500-1000 rows) and
 * filter it in the browser, which meant anyone past the cap was unfindable.
 *
 * `?id=` resolves a single customer so a form can show a pre-selected one
 * without shipping the list.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const id = (searchParams.get("id") ?? "").trim();
  if (id) {
    const customer = await prisma.customer.findUnique({ where: { id }, select: SELECT });
    return NextResponse.json({ results: customer ? [serialize(customer)] : [] });
  }

  const parsed = parseSearchQuery(searchParams.get("q"));
  if (parsed.isEmpty) return NextResponse.json({ results: [] });

  // Intent hits (a full phone number, a well-formed NIC) are OR'd alongside the
  // token match so an exact identifier always finds its customer.
  const intent: Prisma.CustomerWhereInput[] = [];
  if (parsed.phone) intent.push({ phone: parsed.phone });
  if (parsed.nic) intent.push({ nic: contains(parsed.nic) });

  const tokens = tokenMatchWhere<Prisma.CustomerWhereInput>(parsed.tokens, (token) => {
    const digits = token.replace(/\D/g, "");
    const fields: Prisma.CustomerWhereInput[] = [
      { name: contains(token) },
      { nic: contains(token) },
    ];
    if (digits) fields.push({ phone: contains(digits) });
    return fields;
  });

  const where: Prisma.CustomerWhereInput =
    intent.length > 0 ? { OR: [...intent, ...(tokens ? [tokens] : [])] } : (tokens ?? {});

  const customers = await prisma.customer.findMany({
    where,
    take: CANDIDATE_LIMIT,
    orderBy: { name: "asc" },
    select: SELECT,
  });

  const ranked = rankByScore(customers, (c) =>
    scoreMatch(parsed, [
      { value: c.name, weight: 3 },
      { value: c.phone, weight: 2 },
      { value: c.nic, weight: 2 },
    ]) + (parsed.phone && c.phone === parsed.phone ? 40 : 0),
  );

  return NextResponse.json({ results: ranked.slice(0, RESULT_LIMIT).map(serialize) });
}
