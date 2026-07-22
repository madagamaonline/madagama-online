"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Bell, CheckCircle2, Loader2 } from "lucide-react";
import { sendOpenAccountReminder } from "@/app/(app)/open-accounts/actions";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; message: string };

export function SendOpenAccountReminder({ accountId, compact = false }: { accountId: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <div className={compact ? "flex flex-col items-end gap-1.5" : "space-y-2"}>
      <Button
        variant="outline"
        size={compact ? "sm" : "md"}
        disabled={pending}
        onClick={() => start(async () => setResult(await sendOpenAccountReminder(accountId)))}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Send reminder
      </Button>
      {result && (
        <span
          role="status"
          className={result.ok ? "inline-flex items-center gap-1 text-xs font-medium text-success" : "inline-flex max-w-64 items-center gap-1 rounded-md bg-danger-soft px-2 py-1 text-xs font-medium text-danger-ink"}
        >
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {result.message}
        </span>
      )}
    </div>
  );
}
