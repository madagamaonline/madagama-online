"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LolcReceiptError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center text-center"><span className="rounded-xl bg-danger-soft p-3 text-danger"><AlertTriangle className="h-6 w-6" /></span><h1 className="mt-4 text-lg font-bold">Could not load LOLC receipts</h1><p className="mt-1 text-sm text-muted">No accounting data was affected. Try loading this operational register again.</p><Button className="mt-5" onClick={reset}>Try again</Button></div>;
}
