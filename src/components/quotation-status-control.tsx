"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { QuotationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { setQuotationStatus } from "@/app/(app)/quotations/actions";

export const quotationStatusLabel: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "Expired",
};

export const quotationStatusTone: Record<QuotationStatus, "gray" | "amber" | "green" | "red" | "blue"> = {
  DRAFT: "gray",
  SENT: "blue",
  ACCEPTED: "green",
  DECLINED: "red",
  EXPIRED: "amber",
};

const ORDER: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"];

export function QuotationStatusControl({ id, current }: { id: string; current: QuotationStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<QuotationStatus>(current);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function apply() {
    setErr("");
    start(async () => {
      const r = await setQuotationStatus(id, status);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
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
        {pending ? "Updating…" : "Update status"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
