"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaleCustomer = {
  id: string;
  name: string;
  phone: string;
  nic: string | null;
};

type SearchMode = "name" | "nic";

function normalizedNic(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function CustomerSearchPicker({
  customers,
  value,
  onChange,
  inputId = "sale-customer",
}: {
  customers: SaleCustomer[];
  value: string;
  onChange: (customerId: string) => void;
  inputId?: string;
}) {
  const [mode, setMode] = useState<SearchMode>("name");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selected = useMemo(
    () => customers.find((customer) => customer.id === value),
    [customers, value],
  );

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return customers;

    if (mode === "name") {
      const needle = trimmed.toLocaleLowerCase();
      return customers.filter((customer) =>
        customer.name.toLocaleLowerCase().includes(needle),
      );
    }

    const needle = normalizedNic(trimmed);
    if (!needle) return [];
    return customers.filter(
      (customer) =>
        customer.nic != null && normalizedNic(customer.nic).includes(needle),
    );
  }, [customers, mode, query]);

  // Keep an opened empty search useful without rendering hundreds of rows.
  const visibleCustomers = filtered.slice(0, 50);
  const activeCustomer = visibleCustomers[activeIdx];
  const selectedPrimary = selected
    ? mode === "name"
      ? selected.name
      : selected.nic ?? "NIC not recorded"
    : "";

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  function selectMode(nextMode: SearchMode) {
    setMode(nextMode);
    setQuery("");
    setActiveIdx(0);
    setOpen(true);
    inputRef.current?.focus();
  }

  function pick(customer: SaleCustomer) {
    onChange(customer.id);
    setQuery("");
    setOpen(false);
  }

  function clearCustomer() {
    onChange("");
    setQuery("");
    setActiveIdx(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIdx((index) =>
        visibleCustomers.length ? Math.min(index + 1, visibleCustomers.length - 1) : 0,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIdx((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeCustomer) {
      event.preventDefault();
      pick(activeCustomer);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <div
        className="mb-1.5 inline-flex rounded-lg border border-input-border bg-input p-0.5"
        role="group"
        aria-label="Customer search mode"
      >
        {(["name", "nic"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => selectMode(option)}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              mode === option
                ? "bg-surface text-primary-ink shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {option === "name" ? "Name" : "NIC"}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label={mode === "name" ? "Search customer by name" : "Search customer by NIC"}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeCustomer ? `${listboxId}-${activeCustomer.id}` : undefined
          }
          value={open ? query : selectedPrimary}
          onFocus={() => {
            setQuery("");
            setActiveIdx(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIdx(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === "name" ? "Search by customer name…" : "Search by NIC…"
          }
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-input-border bg-input pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div
            id={listboxId}
            role="listbox"
            aria-label={mode === "name" ? "Customers by name" : "Customers by NIC"}
            className="max-h-64 overflow-y-auto py-1"
          >
            {visibleCustomers.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-muted">
                {query.trim()
                  ? `No customers found by ${mode === "name" ? "name" : "NIC"}.`
                  : "No customers available."}
              </div>
            ) : (
              visibleCustomers.map((customer, index) => (
                <button
                  id={`${listboxId}-${customer.id}`}
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={customer.id === value}
                  onClick={() => pick(customer)}
                  onMouseEnter={() => setActiveIdx(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm",
                    index === activeIdx ? "bg-input" : "hover:bg-input",
                    customer.id === value && "bg-primary-soft/60",
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate font-semibold text-foreground",
                        mode === "nic" && "font-mono text-primary-ink",
                      )}
                    >
                      {mode === "name" ? customer.name : customer.nic ?? "NIC not recorded"}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {mode === "name" ? (
                        <>
                          {customer.nic && (
                            <span className="font-mono">NIC {customer.nic} · </span>
                          )}
                          {customer.phone}
                        </>
                      ) : (
                        <>
                          {customer.name} · {customer.phone}
                        </>
                      )}
                    </span>
                  </span>
                  {customer.id === value && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-primary-ink">
                      Selected
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-2.5 py-2 text-xs text-primary-ink">
          <span className="min-w-0 truncate">
            <span className="font-semibold">{selected.name}</span>
            {selected.nic && <span className="font-mono"> · {selected.nic}</span>}
            <span className="text-muted"> · {selected.phone}</span>
          </span>
          <button
            type="button"
            onClick={clearCustomer}
            className="shrink-0 rounded-md p-1 text-primary-ink hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label={`Clear selected customer ${selected.name}`}
            title="Clear customer and use walk-in"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted">Walk-in customer</p>
      )}
    </div>
  );
}
