"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceJobStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { updateServiceJobStatus } from "@/app/(app)/services/actions";
import { serviceStatusLabel } from "@/components/service-status-badge";
import { ActionButtonContent, ActionFeedback } from "@/components/ui/action-feedback";

const ORDER: ServiceJobStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function ServiceStatusControl({ id, current }: { id: string; current: ServiceJobStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ServiceJobStatus>(current);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [updated, setUpdated] = useState(false);

  function apply() {
    setErr("");
    setUpdated(false);
    start(async () => {
      const r = await updateServiceJobStatus(id, status, note || undefined);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setNote("");
      setUpdated(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Select value={status} onChange={(e) => setStatus(e.target.value as ServiceJobStatus)}>
        {ORDER.map((s) => (
          <option key={s} value={s}>
            {serviceStatusLabel[s]}
          </option>
        ))}
      </Select>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. ready for pickup)"
      />
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={pending || status === current}
        onClick={apply}
      >
        <ActionButtonContent pending={pending} success={updated} idleLabel="Update status" pendingLabel="Updating…" successLabel="Status updated" />
      </Button>
      <ActionFeedback error={err} success={updated ? "Service status updated." : undefined} />
    </div>
  );
}
