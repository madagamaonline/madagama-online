"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  calendarMonthCells,
  monthTitle,
  shiftDateKeyMonth,
  type AttendanceStatus,
} from "@/lib/attendance-calendar";
import { cn } from "@/lib/utils";

type Employee = { id: string; name: string };
type AttendanceRecord = { employeeId: string; date: string; status: AttendanceStatus };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_META: Record<
  AttendanceStatus,
  { label: string; shortLabel: string; dot: string; badge: string }
> = {
  PRESENT: {
    label: "Present",
    shortLabel: "Present",
    dot: "bg-success",
    badge: "bg-success-soft text-success-ink",
  },
  HALF_DAY: {
    label: "Half day",
    shortLabel: "Half",
    dot: "bg-clay",
    badge: "bg-clay-soft text-clay-ink",
  },
  ABSENT: {
    label: "Absent",
    shortLabel: "Absent",
    dot: "bg-danger",
    badge: "bg-danger-soft text-danger-ink",
  },
};

export function AttendanceCalendar({
  selectedDate,
  today,
  employees,
  records,
}: {
  selectedDate: string;
  today: string;
  employees: Employee[];
  records: AttendanceRecord[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("all");
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [isPending, startTransition] = useTransition();
  const cells = useMemo(() => calendarMonthCells(selectedDate), [selectedDate]);

  const recordsByDay = useMemo(() => {
    const grouped = new Map<string, AttendanceRecord[]>();
    for (const record of records) {
      const dayRecords = grouped.get(record.date) ?? [];
      dayRecords.push(record);
      grouped.set(record.date, dayRecords);
    }
    return grouped;
  }, [records]);

  const monthStats = useMemo(() => {
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    for (const date of cells) {
      if (!date) continue;
      const dayRecords = recordsByDay.get(date) ?? [];
      if (employeeId === "all") {
        for (const rec of dayRecords) {
          if (rec.status === "PRESENT") present++;
          else if (rec.status === "HALF_DAY") halfDay++;
          else if (rec.status === "ABSENT") absent++;
        }
      } else {
        const rec = dayRecords.find((r) => r.employeeId === employeeId);
        if (rec?.status === "PRESENT") present++;
        else if (rec?.status === "HALF_DAY") halfDay++;
        else if (rec?.status === "ABSENT") absent++;
      }
    }
    return { present, halfDay, absent };
  }, [cells, recordsByDay, employeeId]);

  function openDate(date: string) {
    setDirection(date < selectedDate ? -1 : date > selectedDate ? 1 : 0);
    startTransition(() => {
      router.push(`/attendance?date=${date}`, { scroll: false });
    });
  }

  function moveMonth(amount: number) {
    openDate(shiftDateKeyMonth(selectedDate, amount));
  }

  return (
    <Card className="overflow-hidden" aria-busy={isPending}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => moveMonth(-1)}
              disabled={isPending}
              aria-label="View previous month"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openDate(today)}
              disabled={isPending || selectedDate === today}
              className="h-9 px-2.5 text-xs font-semibold"
            >
              Today
            </Button>
          </div>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Monthly register
            </p>
            <h2 className="mt-0.5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {monthTitle(selectedDate)}
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => moveMonth(1)}
            disabled={isPending}
            aria-label="View next month"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <div className="flex items-center gap-3">
            <label htmlFor="attendance-employee" className="shrink-0 text-xs font-semibold text-muted">
              Employee
            </label>
            <Select
              id="attendance-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="h-9 min-w-0 sm:w-64"
            >
              <option value="all">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-success-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {monthStats.present} Present
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-2.5 py-1 text-clay-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-clay" />
              {monthStats.halfDay} Half
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-danger-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              {monthStats.absent} Absent
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5">
        <div
          key={selectedDate.slice(0, 7)}
          className={cn("motion-content-handoff grid grid-cols-7 overflow-hidden rounded-xl border border-border bg-border", direction < 0 ? "motion-content-right" : direction > 0 ? "motion-content-left" : "")}
          aria-busy={isPending}
        >
          {WEEKDAYS.map((weekday, idx) => {
            const isWeekendHeader = idx >= 5;
            return (
              <div
                key={weekday}
                className={cn(
                  "px-0.5 py-2 text-center text-[10px] font-bold uppercase tracking-wide sm:text-xs",
                  isWeekendHeader
                    ? "bg-clay-soft/40 text-clay-ink font-black"
                    : "bg-input text-muted",
                )}
              >
                {weekday}
              </div>
            );
          })}

          {cells.map((date, index) => {
            const isWeekendCell = index % 7 >= 5;

            if (!date) {
              return (
                <div
                  key={`empty-${index}`}
                  aria-hidden="true"
                  className={cn(
                    "min-h-17 sm:min-h-24",
                    isWeekendCell ? "bg-input/80 opacity-60" : "bg-input/40",
                  )}
                />
              );
            }

            const dayRecords = recordsByDay.get(date) ?? [];
            const employeeRecord = dayRecords.find((record) => record.employeeId === employeeId);
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const dayNumber = Number(date.slice(-2));
            const fullDate = new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            });
            const counts = {
              PRESENT: dayRecords.filter((record) => record.status === "PRESENT").length,
              HALF_DAY: dayRecords.filter((record) => record.status === "HALF_DAY").length,
              ABSENT: dayRecords.filter((record) => record.status === "ABSENT").length,
            };
            const summary =
              employeeId === "all"
                ? dayRecords.length > 0
                  ? `Present ${counts.PRESENT}, half day ${counts.HALF_DAY}, absent ${counts.ABSENT}`
                  : "Not marked"
                : employeeRecord
                  ? STATUS_META[employeeRecord.status].label
                  : "Not marked";

            return (
              <button
                type="button"
                key={date}
                onClick={() => openDate(date)}
                disabled={isPending}
                aria-label={`${fullDate}: ${summary}`}
                aria-current={isSelected ? "date" : undefined}
                className={cn(
                  "relative min-h-17 bg-surface p-1 text-left align-top transition-colors hover:z-10 hover:bg-primary-soft/35 focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70 sm:min-h-24 sm:p-2",
                  isWeekendCell && !isSelected && "bg-surface-elevated/40",
                  isSelected && "z-10 bg-primary-soft/45 ring-2 ring-inset ring-primary",
                  isToday && !isSelected && "ring-1 ring-inset ring-clay",
                )}
              >
                <span
                  className={cn(
                    "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-md text-[11px] font-bold text-foreground sm:text-xs",
                    isSelected && "bg-primary text-primary-foreground",
                    isWeekendCell && !isSelected && "text-clay-ink font-extrabold",
                  )}
                >
                  {dayNumber}
                </span>

                <span className="mt-1 block sm:mt-2">
                  {employeeId === "all" ? (
                    dayRecords.length > 0 ? (
                      <span className="space-y-0.5 sm:space-y-1">
                        {(["PRESENT", "HALF_DAY", "ABSENT"] as const).map((status) => (
                          <span
                            key={status}
                            className="flex items-center gap-1 text-[9px] font-semibold leading-tight text-muted sm:text-[11px]"
                          >
                            <span
                              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[status].dot)}
                              aria-hidden="true"
                            />
                            <span className="sm:hidden">{status === "PRESENT" ? "P" : status === "HALF_DAY" ? "H" : "A"}</span>
                            <span className="hidden sm:inline">{STATUS_META[status].label}</span>
                            <span className="tabular ml-auto text-foreground">{counts[status]}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="block text-[9px] leading-tight text-faint sm:text-[11px]">Not marked</span>
                    )
                  ) : employeeRecord ? (
                    <span
                      className={cn(
                        "block rounded-md px-1 py-1 text-center text-[9px] font-bold leading-tight sm:px-1.5 sm:text-[11px]",
                        STATUS_META[employeeRecord.status].badge,
                      )}
                    >
                      <span className="sm:hidden">{STATUS_META[employeeRecord.status].shortLabel}</span>
                      <span className="hidden sm:inline">{STATUS_META[employeeRecord.status].label}</span>
                    </span>
                  ) : (
                    <span className="block text-[9px] leading-tight text-faint sm:text-[11px]">Not marked</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border-subtle pt-4" aria-label="Attendance status legend">
          {(["PRESENT", "HALF_DAY", "ABSENT"] as const).map((status) => (
            <span key={status} className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span className={cn("h-2 w-2 rounded-full", STATUS_META[status].dot)} aria-hidden="true" />
              {STATUS_META[status].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <span className="h-2 w-2 rounded-full border border-input-border bg-input" aria-hidden="true" />
            Not marked
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
