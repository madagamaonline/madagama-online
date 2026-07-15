import { LolcInstallmentReceipt } from "@/components/lolc-installment-receipt";
import { PageHeader } from "@/components/page-header";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function todayInSriLanka(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function LolcReceiptPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="LOLC Installment Receipt"
        subtitle="Print a collection receipt without recording a sale or changing business accounts."
      />
      <LolcInstallmentReceipt
        businessName={settings?.businessName ?? "Madagama Pvt Ltd"}
        businessPhone={settings?.phone ?? ""}
        businessAddress={settings?.address ?? ""}
        initialDate={todayInSriLanka()}
      />
    </div>
  );
}
