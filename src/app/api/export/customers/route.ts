import { prisma } from "@/lib/prisma";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { creditAgreements: true } } },
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
