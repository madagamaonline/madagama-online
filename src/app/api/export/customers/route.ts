import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  // Don't rely on the proxy/middleware alone — this dump contains customer PII
  // (names, phones, NICs, addresses), so re-check auth at the route itself.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { creditAgreements: { where: { status: { not: "VOIDED" }, invoice: { voidedAt: null } } } } } },
    take: 5000,
  });

  const csv = toCsv(
    ["Name", "Phone", "NIC", "Email", "Address", "Credit agreements", "Added"],
    customers.map((c) => [
      c.name,
      c.phone,
      c.nic ?? "",
      c.email ?? "",
      c.address ?? "",
      c._count.creditAgreements,
      csvDate(c.createdAt),
    ]),
  );

  return csvResponse(csv, `customers-${csvDate(new Date())}.csv`);
}
