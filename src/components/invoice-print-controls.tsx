"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "a4" | "thermal";

/**
 * Print controls for the invoice view. Lets the user pick a paper layout
 * (A4 or 80mm thermal receipt) before printing. The choice is reflected as
 * `data-print-mode` on <html>, which the print CSS uses to select the layout
 * and page size. The physical printer is still chosen in the browser's print
 * dialog — this only decides how the invoice is rendered.
 */
export function InvoicePrintControls() {
  const [mode, setMode] = useState<Mode>("a4");

  // Keep the DOM in sync so the on-screen preview matches what will print.
  useEffect(() => {
    document.documentElement.dataset.printMode = mode;
    return () => {
      delete document.documentElement.dataset.printMode;
    };
  }, [mode]);

  const options: { value: Mode; label: string }[] = [
    { value: "a4", label: "A4" },
    { value: "thermal", label: "80mm" },
  ];

  return (
    <div className="no-print flex items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-xl border border-input-border">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            aria-pressed={mode === opt.value}
            className={cn(
              "h-11 px-4 text-sm font-semibold transition-colors",
              opt.value === "thermal" && "border-l border-input-border",
              mode === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted hover:bg-input",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print Invoice
      </Button>
    </div>
  );
}
