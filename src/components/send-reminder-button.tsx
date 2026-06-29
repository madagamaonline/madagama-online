"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendReminderNow } from "@/app/(app)/credit/actions";

export function SendReminderButton({
  agreementId,
  compact = false,
}: {
  agreementId: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function send() {
    setMsg("");
    startTransition(async () => {
      const r = await sendReminderNow(agreementId);
      setMsg(r.message);
    });
  }

  if (compact) {
    return (
      <span className="inline-flex items-center justify-end gap-2">
        {msg && <span className="text-[11px] text-muted">{msg}</span>}
        <Button variant="outline" size="sm" onClick={send} disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          Send SMS
        </Button>
      </span>
    );
  }

  return (
    <div>
      <Button variant="outline" onClick={send} disabled={pending} className="w-full">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Send reminder SMS
      </Button>
      {msg && <p className="mt-2 text-center text-xs text-muted">{msg}</p>}
    </div>
  );
}
