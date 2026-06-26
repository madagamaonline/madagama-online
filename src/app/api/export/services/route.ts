import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { toCsv, csvResponse, csvDate } from "@/lib/csv";
import { serviceStatusLabel } from "@/components/service-status-badge";

export const dynamic = "force-dynamic";

export async function GET() {
  // Contains customer contact info — re-check auth at the route, not just the proxy.
  if (!(await getSession())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const jobs = await prisma.serviceJob.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true, phone: true } } },
    take: 5000,
  });

  const csv = toCsv(
    [
      "Job #",
      "Date",
      "Status",
      "Item",
      "Brand",
      "Serial",
      "Under warranty",
      "Customer / contact",
      "Phone",
      "Issue",
      "Resolution",
      "Notes",
    ],
    jobs.map((j) => [
      j.jobNumber,
      csvDate(j.createdAt),
      serviceStatusLabel[j.status],
      j.itemName,
      j.brand ?? "",
      j.serialNumber ?? "",
      j.underWarranty ? "Yes" : "No",
      j.customer?.name ?? j.contactName ?? "Walk-in",
      j.customer?.phone ?? j.contactPhone ?? "",
      j.issue,
      j.resolution ?? "",
      j.notes ?? "",
    ]),
  );

  return csvResponse(csv, `service-jobs-${csvDate(new Date())}.csv`);
}
