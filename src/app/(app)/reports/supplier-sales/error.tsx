"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-danger/20 bg-danger-soft p-8 text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" /><h2 className="font-bold text-danger-ink">Supplier sales could not be loaded</h2><p className="mt-1 text-sm text-danger-ink">No data was changed. Try loading the report again.</p><Button className="mt-4" variant="outline" onClick={reset}>Try again</Button></div>;
}
