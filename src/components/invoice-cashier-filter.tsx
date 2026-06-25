"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

/** Dropdown that filters the invoices list by the cashier (login user) who created each invoice. */
export function InvoiceCashierFilter({
  cashiers,
  current,
}: {
  cashiers: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(params.toString());
    if (e.target.value) sp.set("cashier", e.target.value);
    else sp.delete("cashier");
    const qs = sp.toString();
    router.push(qs ? `/invoices?${qs}` : "/invoices");
  }

  return (
    <Select value={current} onChange={onChange} className="h-9 w-44 text-sm" aria-label="Filter by cashier">
      <option value="">All cashiers</option>
      {cashiers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
