"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePayroll } from "@/app/(app)/payroll/actions";

export function PayrollControls({ month }: { month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Month:</span>
        <Input
          type="month"
          value={month}
          onChange={(e) => router.push(`/payroll?month=${e.target.value}`)}
          className="w-44"
        />
      </div>
      <Button onClick={() => startTransition(() => generatePayroll(month))} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Save Salary Sheet
      </Button>
    </div>
  );
}
