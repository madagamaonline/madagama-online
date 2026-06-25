import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AttendanceGrid } from "@/components/attendance-grid";

export const dynamic = "force-dynamic";

type Status = "PRESENT" | "ABSENT" | "HALF_DAY";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam ?? new Date().toISOString().slice(0, 10);
  const dateObj = new Date(date + "T00:00:00.000Z");

  const [employees, records] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.attendance.findMany({ where: { date: dateObj } }),
  ]);

  const initial: Record<string, Status> = {};
  for (const r of records) initial[r.employeeId] = r.status as Status;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Attendance" subtitle="Mark daily attendance for staff" />
      <AttendanceGrid date={date} employees={employees} initial={initial} />
    </div>
  );
}
