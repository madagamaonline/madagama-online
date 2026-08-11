"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search, TriangleAlert, X } from "lucide-react";
import { useRemoteSearch } from "@/hooks/use-remote-search";
import { Highlight } from "@/components/highlight";
import { cn } from "@/lib/utils";

export type SaleCustomer = {
  id: string;
  name: string;
  phone: string;
  nic: string | null;
};

/**
 * Customer picker for the POS, credit, layaway and service-job forms.
 *
 * Searches the server rather than filtering a preloaded array: the forms used
 * to ship the whole customer table (capped at 500-1000 rows) to the browser,
 * so anyone past the cap simply could not be found. One box now matches name,
 * phone and NIC together — the old Name/NIC toggle is gone because the server
 * searches all three at once.
 *
 * `recentCustomers` is a small seed (latest records, plus anything just created
 * through Quick Add) shown before the cashier types, and used to resolve the
 * selected customer without a round trip.
 */
export function CustomerSearchPicker({
  recentCustomers = [],
  value,
  onChange,
  inputId = "sale-customer",
  emptyText = "Walk-in customer",
}: {
  recentCustomers?: SaleCustomer[];
  value: string;
  /** The full record comes along so callers don't have to look the id back up. */
  onChange: (customerId: string, customer: SaleCustomer | null) => void;
  inputId?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [resolved, setResolved] = useState<SaleCustomer | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const search = useRemoteSearch<SaleCustomer>({
    url: (q) => `/api/customers/search?q=${encodeURIComponent(q)}`,
    select: (data) => (data as { results?: SaleCustomer[] }).results ?? [],
    minLength: 2,
    enabled: open,
  });
  const { query, setQuery, results, isLoading, isEmpty, error, reset } = search;

  // Derived, not stored, so clearing `value` can never leave a stale name on
  // screen. The picked/fetched record only fills the gap when the seed misses.
  const selected = value
    ? recentCustomers.find((customer) => customer.id === value) ??
      (resolved?.id === value ? resolved : null)
    : null;

  // Edit forms arrive with a customer that isn't in the seed — fetch just that
  // one so the box shows a name instead of an empty field.
  useEffect(() => {
    if (!value || selected) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/customers/search?id=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: SaleCustomer[] };
        const hit = data.results?.[0];
        if (hit) setResolved(hit);
      } catch {
        /* the field just stays blank; the id is still submitted */
      }
    })();
    return () => controller.abort();
  }, [value, selected]);

  // Before the cashier types, offer the recent customers rather than nothing.
  const options = query.trim().length >= 2 ? results : recentCustomers.slice(0, 8);
  const activeCustomer = options[activeIdx];
  const showRecent = query.trim().length < 2;

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        reset();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, reset]);

  function pick(customer: SaleCustomer) {
    setResolved(customer);
    onChange(customer.id, customer);
    setOpen(false);
    reset();
  }

  function clearCustomer() {
    setResolved(null);
    onChange("", null);
    setActiveIdx(0);
    setOpen(false);
    reset();
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIdx((index) => (options.length ? Math.min(index + 1, options.length - 1) : 0));
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
      reset();
    }
  }

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-label="Search customer by name, phone or NIC"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeCustomer ? `${listboxId}-${activeCustomer.id}` : undefined
          }
          value={open ? query : selected?.name ?? ""}
          onFocus={() => {
            setActiveIdx(0);
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIdx(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search name, phone or NIC…"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-input-border bg-input pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {isLoading && (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-faint" />
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {showRecent && recentCustomers.length > 0 && (
            <p className="border-b border-border-subtle px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              Recent customers
            </p>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label="Customers"
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.length === 0 ? (
              <div className="px-3.5 py-3 text-sm">
                {error ? (
                  <span className="flex items-center gap-2 text-danger">
                    <TriangleAlert className="h-4 w-4 shrink-0" />
                    Could not reach the server. Check the connection and try again.
                  </span>
                ) : isLoading ? (
                  <span className="text-muted">Searching…</span>
                ) : isEmpty ? (
                  <span className="text-muted">No customer matches “{query.trim()}”.</span>
                ) : (
                  <span className="text-muted">Type a name, phone number or NIC to search.</span>
                )}
              </div>
            ) : (
              options.map((customer, index) => (
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
                    <span className="block truncate font-semibold text-foreground">
                      <Highlight text={customer.name} query={query} />
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {customer.nic && (
                        <span className="font-mono">
                          NIC <Highlight text={customer.nic} query={query} /> ·{" "}
                        </span>
                      )}
                      <Highlight text={customer.phone} query={query} />
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
          <p className="sr-only" role="status" aria-live="polite">
            {isLoading
              ? "Searching customers."
              : `${options.length} customer${options.length === 1 ? "" : "s"} available.`}
          </p>
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
            title="Clear selected customer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted">{emptyText}</p>
      )}
    </div>
  );
}
