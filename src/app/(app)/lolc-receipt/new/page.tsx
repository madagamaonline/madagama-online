import { PageHeader } from "@/components/page-header";
import { LolcReceiptForm } from "@/components/lolc-receipt-form";
import { createLolcReceipt } from "../actions";

export const dynamic = "force-dynamic";

function todayInSriLanka(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default function NewLolcReceiptPage() {
  return <div className="mx-auto max-w-4xl">
    <PageHeader title="New LOLC receipt" subtitle="Record the customer collection before printing the receipt." />
    <LolcReceiptForm action={createLolcReceipt} initialDate={todayInSriLanka()} submissionKey={crypto.randomUUID()} />
  </div>;
}
