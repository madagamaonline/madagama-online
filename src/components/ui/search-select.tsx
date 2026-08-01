"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchSelectOption = { value: string; label: string; hint?: string };

/**
 * Type-to-filter single-select combobox. Client-side filtering over a list
 * that's already loaded — no network calls. Keyboard: ↑/↓ move, Enter picks,
 * Esc closes. Falls back to a plain scrollable list when the query is empty.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "No matches.",
  disabled,
  className,
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;
  const inputId = `${generatedId}-input`;

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Focus the search box + reset highlight whenever the menu opens. State is set
  // inside the timeout (not the effect body) to satisfy set-state-in-effect.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      setActiveIdx(0);
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        className={cn(
          "motion-interactive flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input-border bg-input px-3.5 text-left text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60",
          selected ? "text-foreground" : "text-faint",
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown data-open={open} className="motion-chevron h-4 w-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="motion-menu-in absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id={inputId}
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered[activeIdx]) pick(filtered[activeIdx].value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={filtered[activeIdx] ? `${generatedId}-option-${activeIdx}` : undefined}
              className="h-9 w-full rounded-lg border border-input-border bg-input pl-8 pr-8 text-sm text-foreground outline-none placeholder:text-faint focus:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:bg-input"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div id={listboxId} role="listbox" aria-labelledby={inputId} className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-3 text-sm text-muted">{emptyText}</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  id={`${generatedId}-option-${i}`}
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => pick(o.value)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "motion-interactive flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm",
                    i === activeIdx ? "bg-input" : "hover:bg-input",
                    o.value === value ? "font-semibold text-primary-ink" : "text-foreground",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-muted">{o.hint}</span>}
                </button>
              ))
            )}
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {filtered.length === 0 ? emptyText : `${filtered.length} option${filtered.length === 1 ? "" : "s"} available.`}
          </p>
        </div>
      )}
    </div>
  );
}
