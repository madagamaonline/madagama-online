"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "a4" | "thermal";

async function printThermalReceipt(onAfterPrint?: () => void) {
  const receipt = document.querySelector<HTMLElement>(".print-thermal");
  if (!receipt) throw new Error("Thermal receipt was not found.");

  // Print from an isolated document so the hidden application shell cannot
  // create blank A4 pages around the receipt.
  const frame = document.createElement("iframe");
  frame.title = "Thermal receipt print";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument;
  if (!printWindow || !printDocument) {
    frame.remove();
    throw new Error("Could not create the thermal print document.");
  }

  printDocument.open();
  printDocument.write("<!doctype html><html><head></head><body></body></html>");
  printDocument.close();

  const base = printDocument.createElement("base");
  base.href = window.location.origin;
  printDocument.head.appendChild(base);

  const stylesheetLoads: Promise<void>[] = [];
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((source) => {
    const link = source.cloneNode(true) as HTMLLinkElement;
    stylesheetLoads.push(new Promise((resolve) => {
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
    }));
    printDocument.head.appendChild(link);
  });
  document.querySelectorAll<HTMLStyleElement>("style").forEach((source) => {
    printDocument.head.appendChild(source.cloneNode(true));
  });

  printDocument.body.appendChild(receipt.cloneNode(true));

  // Do not wait indefinitely if a stylesheet is served from cache without a
  // load event. The receipt-specific rules below still provide safe sizing.
  await Promise.race([
    Promise.all(stylesheetLoads),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
  ]);
  await printDocument.fonts?.ready;

  const isolatedStyle = printDocument.createElement("style");
  isolatedStyle.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 80mm !important;
      min-height: 0 !important;
      background: white !important;
    }
    .print-thermal {
      display: block !important;
      position: static !important;
      page: auto !important;
      box-sizing: border-box !important;
      font-family: Arial, Helvetica, sans-serif !important;
      font-weight: 400 !important;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      width: 72mm !important;
      max-width: 72mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      visibility: visible !important;
    }
    .print-thermal * {
      visibility: visible !important;
    }
  `;
  printDocument.head.appendChild(isolatedStyle);

  const isolatedReceipt = printDocument.querySelector<HTMLElement>(".print-thermal");
  if (!isolatedReceipt) {
    frame.remove();
    throw new Error("Could not prepare the thermal receipt.");
  }
  Object.assign(isolatedReceipt.style, {
    width: "72mm",
    maxWidth: "72mm",
    height: "auto",
    margin: "0",
    padding: "0",
  });

  const contentHeightMm = Math.ceil(isolatedReceipt.scrollHeight * 25.4 / 96);
  const pageHeightMm = Math.max(60, contentHeightMm + 8);
  isolatedStyle.textContent += `
    @page {
      size: 80mm ${pageHeightMm}mm;
      margin: 4mm;
    }
  `;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    frame.remove();
    onAfterPrint?.();
  };
  printWindow.addEventListener("afterprint", finish, { once: true });
  window.setTimeout(finish, 300_000);
  printWindow.focus();
  printWindow.print();
}

/**
 * Print controls for the invoice view. Lets the user pick a paper layout
 * (A4 or 80mm thermal receipt) before printing. The choice is reflected as
 * `data-print-mode` on <html>, which the print CSS uses to select the layout
 * and page size. The physical printer is still chosen in the browser's print
 * dialog — this only decides how the invoice is rendered.
 */
export function InvoicePrintControls({
  label = "Print Invoice",
  onBeforePrint,
  onAfterPrint,
}: {
  label?: string;
  onBeforePrint?: () => boolean;
  onAfterPrint?: () => void;
} = {}) {
  const [mode, setMode] = useState<Mode>("a4");

  // Keep the DOM in sync so the on-screen preview matches what will print.
  useEffect(() => {
    document.documentElement.dataset.printMode = mode;
    return () => {
      delete document.documentElement.dataset.printMode;
    };
  }, [mode]);

  function printInvoice() {
    if (onBeforePrint && !onBeforePrint()) return;

    if (mode === "thermal") {
      void printThermalReceipt(onAfterPrint).catch((error: unknown) => {
        console.error(error);
        window.alert("Could not prepare the 80mm receipt. Please try again.");
      });
    } else {
      const finish = () => onAfterPrint?.();
      window.addEventListener("afterprint", finish, { once: true });
      try {
        window.print();
      } catch (error) {
        window.removeEventListener("afterprint", finish);
        throw error;
      }
    }
  }

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
      <Button type="button" variant="outline" onClick={printInvoice}>
        <Printer className="h-4 w-4" /> {label}
      </Button>
    </div>
  );
}
