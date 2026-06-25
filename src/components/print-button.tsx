"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
