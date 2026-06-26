"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceJobStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { updateServiceJobStatus } from "@/app/(app)/services/actions";
import { serviceStatusLabel } from "@/components/service-status-badge";

const ORDER: ServiceJobStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function ServiceStatusControl({ id, current }: { id: string; current: ServiceJobStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<ServiceJobStatus>(current);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function apply() {
    setErr("");
    start(async () => {
      const r = await updateServiceJobStatus(id, status, note || undefined);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setNote("");
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
        {pending ? "Updating…" : "Update status"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
