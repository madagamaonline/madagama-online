import { BankAccountForm } from "@/components/bank-account-form";
import { PageHeader } from "@/components/page-header";

export default function NewBankAccountPage() {
  return <div className="mx-auto max-w-2xl"><PageHeader title="Add bank account" subtitle="Register a cheque account and its optional overdraft facility" /><BankAccountForm /></div>;
}
