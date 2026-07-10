import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { AttendanceGrid } from "@/components/attendance-grid";
import { AttendanceCalendar } from "@/components/attendance-calendar";
import { businessDayKey } from "@/lib/dates";
import {
  isValidDateKey,
  monthBounds,
  type AttendanceStatus,
} from "@/lib/attendance-calendar";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const today = businessDayKey(new Date());
  const date = isValidDateKey(dateParam) ? dateParam : today;
  const dateObj = new Date(date + "T00:00:00.000Z");
  const { start: monthStart, end: monthEnd } = monthBounds(date);

  const [employees, records] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.attendance.findMany({
      where: {
        date: { gte: monthStart, lt: monthEnd },
        employee: { active: true },
      },
      select: { employeeId: true, date: true, status: true },
    }),
  ]);

  const initial: Record<string, AttendanceStatus> = {};
  for (const record of records) {
    if (record.date.getTime() === dateObj.getTime()) initial[record.employeeId] = record.status;
  }

  const calendarRecords = records.map((record) => ({
    employeeId: record.employeeId,
    date: record.date.toISOString().slice(0, 10),
    status: record.status,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Attendance" subtitle="Review the monthly register and mark daily attendance" />
      <AttendanceCalendar
        selectedDate={date}
        today={today}
        employees={employees}
        records={calendarRecords}
      />

      <section id="daily-attendance" className="mx-auto mt-8 max-w-2xl" aria-labelledby="daily-attendance-title">
        <div className="mb-3 border-t border-border pt-6">
          <h2 id="daily-attendance-title" className="text-base font-bold tracking-tight text-foreground">
            Daily attendance
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Select a date above or use the date field to update the register.</p>
        </div>
        <AttendanceGrid key={date} date={date} employees={employees} initial={initial} />
      </section>
    </div>
  );
}
