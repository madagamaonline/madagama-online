"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveAttendance } from "@/app/(app)/attendance/actions";

type Status = "PRESENT" | "ABSENT" | "HALF_DAY";
type Employee = { id: string; name: string };

const OPTIONS: { value: Status; label: string; tone: string }[] = [
  { value: "PRESENT", label: "Present", tone: "bg-primary text-primary-foreground hover:bg-primary-hover" },
  { value: "HALF_DAY", label: "Half day", tone: "bg-clay text-white hover:brightness-95" },
  { value: "ABSENT", label: "Absent", tone: "bg-danger text-white hover:brightness-95" },
];

export function AttendanceGrid({
  date,
  employees,
  initial,
}: {
  date: string;
  employees: Employee[];
  initial: Record<string, Status>;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, Status>>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function setStatus(employeeId: string, status: Status) {
    setStatuses((s) => ({ ...s, [employeeId]: status }));
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      const entries = employees.map((e) => ({
        employeeId: e.id,
        status: statuses[e.id] ?? "PRESENT",
      }));
      const r = await saveAttendance({ date, entries });
      if (r.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Date:</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => router.push(`/attendance?date=${e.target.value}`)}
              className="w-44"
            />
          </div>
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saved ? "Saved" : "Save Attendance"}
          </Button>
        </div>

        {employees.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No active employees.</p>
        ) : (
          <div className="divide-y divide-border">
            {employees.map((e) => {
              const current = statuses[e.id] ?? "PRESENT";
              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="font-medium">{e.name}</span>
                  <div className="flex gap-1">
                    {OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => setStatus(e.id, o.value)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors cursor-pointer",
                          current === o.value ? o.tone : "bg-input border border-input-border/30 text-muted hover:bg-border-subtle hover:text-foreground",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
