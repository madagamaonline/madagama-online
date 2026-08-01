"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuotationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { setQuotationStatus } from "@/app/(app)/quotations/actions";
import { quotationStatusLabel } from "@/components/quotation-status-badge";
import { ActionButtonContent, ActionFeedback } from "@/components/ui/action-feedback";

const ORDER: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

export function QuotationStatusControl({ id, current }: { id: string; current: QuotationStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<QuotationStatus>(current);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [updated, setUpdated] = useState(false);

  function apply() {
    setErr("");
    setUpdated(false);
    start(async () => {
      const r = await setQuotationStatus(id, status);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setUpdated(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Select value={status} onChange={(e) => setStatus(e.target.value as QuotationStatus)}>
        {ORDER.map((s) => (
          <option key={s} value={s}>
            {quotationStatusLabel[s]}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={pending || status === current}
        onClick={apply}
      >
        <ActionButtonContent pending={pending} success={updated} idleLabel="Update status" pendingLabel="Updating…" successLabel="Status updated" />
      </Button>
      <ActionFeedback error={err} success={updated ? "Quotation status updated." : undefined} />
    </div>
  );
}
