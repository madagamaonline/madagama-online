"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  Package,
  Users,
  CreditCard,
  Truck,
  PackagePlus,
  PackageX,
  UserCog,
  CalendarCheck,
  Wallet,
  Receipt,
  TrendingUp,
  Settings,
  Search,
  Bell,
  ClipboardCheck,
  Undo2,
  Wrench,
  UserPlus,
  CornerDownLeft,
  Loader2,
  FileText,
  MessageSquareText,
  Landmark,
  HandCoins,
  Tractor,
  CircleDollarSign,
  PackageCheck,
} from "lucide-react";
import { formatLKR } from "@/lib/utils";
import { useRemoteSearch } from "@/hooks/use-remote-search";
import { canAccessStaffFinance } from "@/lib/authorization";
import type { Role } from "@/lib/session";

type Cmd = { id: string; group: string; label: string; sub?: string; icon: React.ElementType; href: string };

const ACTIONS: Cmd[] = [
  { id: "a-cash", group: "Actions", label: "New Cash Sale", sub: "Start a cash checkout", icon: ShoppingCart, href: "/invoices/new" },
  { id: "a-credit", group: "Actions", label: "New Credit Sale", sub: "Sell on credit", icon: CreditCard, href: "/credit/new" },
  { id: "a-layaway", group: "Actions", label: "New Layaway", sub: "Reserve goods and collect installments", icon: PackageCheck, href: "/layaways/new" },
  { id: "a-quote", group: "Actions", label: "New Quotation", sub: "Prepare a price quote", icon: FileText, href: "/quotations/new" },
  { id: "a-lolc", group: "Actions", label: "New LOLC Receipt", sub: "Record a customer collection", icon: HandCoins, href: "/lolc-receipt/new" },
  { id: "a-product", group: "Actions", label: "New Product", sub: "Add a stock item", icon: PackagePlus, href: "/products/new" },
  { id: "a-customer", group: "Actions", label: "New Customer", sub: "Add a customer", icon: UserPlus, href: "/customers/new" },
  { id: "a-request", group: "Actions", label: "New Customer Request", sub: "Record a product inquiry or import request", icon: MessageSquareText, href: "/requests/new" },
  { id: "a-purchase", group: "Actions", label: "New Purchase", sub: "Record a supplier purchase", icon: Truck, href: "/purchases/new" },
  { id: "a-expense", group: "Actions", label: "Add Expense", sub: "Record an expense", icon: Receipt, href: "/expenses" },
  { id: "a-cheque", group: "Actions", label: "Issue Supplier Cheque", sub: "Register a cheque from a bank account", icon: Landmark, href: "/banking/cheques/new" },
  { id: "a-vehicle", group: "Actions", label: "Receive Consignment Vehicle", sub: "Add a supplier-owned tractor or harvester", icon: Tractor, href: "/vehicles/new" },
];

const PAGES: Cmd[] = [
  { id: "p-dash", group: "Go to", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "p-rem", group: "Go to", label: "Reminders", icon: Bell, href: "/reminders" },
  { id: "p-inv", group: "Go to", label: "Invoices", icon: ReceiptText, href: "/invoices" },
  { id: "p-open", group: "Go to", label: "Customer Balances", sub: "Collect Pay Later balances", icon: CircleDollarSign, href: "/open-accounts" },
  { id: "p-layaways", group: "Go to", label: "Layaways", sub: "Reserved goods paid before pickup", icon: PackageCheck, href: "/layaways" },
  { id: "p-credit-inv", group: "Go to", label: "Credit Invoices", sub: "Credit-sale document register", icon: CreditCard, href: "/credit-invoices" },
  { id: "p-lolc", group: "Go to", label: "LOLC Receipts", sub: "Track customer collections and LOLC confirmation", icon: HandCoins, href: "/lolc-receipt" },
  { id: "p-quo", group: "Go to", label: "Quotations", icon: FileText, href: "/quotations" },
  { id: "p-ret", group: "Go to", label: "Returns", icon: Undo2, href: "/returns" },
  { id: "p-svc", group: "Go to", label: "Service Jobs", icon: Wrench, href: "/services" },
  { id: "p-req", group: "Go to", label: "Customer Requests", icon: MessageSquareText, href: "/requests" },
  { id: "p-cust", group: "Go to", label: "Customers", icon: Users, href: "/customers" },
  { id: "p-cred", group: "Go to", label: "Credit", icon: CreditCard, href: "/credit" },
  { id: "p-prod", group: "Go to", label: "Products", icon: Package, href: "/products" },
  { id: "p-labels", group: "Go to", label: "Sticker Labels", sub: "Print product short-code stickers", icon: Package, href: "/products/labels" },
  { id: "p-sup", group: "Go to", label: "Suppliers", icon: Truck, href: "/suppliers" },
  { id: "p-pur", group: "Go to", label: "Purchases", icon: PackagePlus, href: "/purchases" },
  { id: "p-sret", group: "Go to", label: "Supplier Returns", icon: PackageX, href: "/supplier-returns" },
  { id: "p-vehicles", group: "Go to", label: "Consignment Vehicles", icon: Tractor, href: "/vehicles" },
  { id: "p-vehicle-sales", group: "Go to", label: "Vehicle Sales", icon: Tractor, href: "/vehicle-sales" },
  { id: "p-emp", group: "Go to", label: "Employees", icon: UserCog, href: "/employees" },
  { id: "p-att", group: "Go to", label: "Attendance", icon: CalendarCheck, href: "/attendance" },
  { id: "p-pay", group: "Go to", label: "Payroll", icon: Wallet, href: "/payroll" },
  { id: "p-exp", group: "Go to", label: "Expenses", icon: Receipt, href: "/expenses" },
  { id: "p-bank", group: "Go to", label: "Bank & Cheques", icon: Landmark, href: "/banking" },
  { id: "p-shift", group: "Go to", label: "Shift Reports", icon: ClipboardCheck, href: "/shift-report" },
  { id: "p-rep", group: "Go to", label: "Reports", icon: TrendingUp, href: "/reports" },
  { id: "p-set", group: "Go to", label: "Settings", icon: Settings, href: "/settings" },
];

type ProductHit = { id: string; code: string; shortCode?: number; name: string; sellingPrice: number; stock: number };
type CustomerHit = { id: string; name: string; phone: string; nic: string | null };
type InvoiceHit = { id: string; invoiceNumber: string; grandTotal: number; customerName: string | null };
type ServiceJobHit = { id: string; jobNumber: string; itemName: string; status: string; customerName: string | null };
type GlobalHits = {
  products: ProductHit[];
  customers: CustomerHit[];
  invoices: InvoiceHit[];
  serviceJobs: ServiceJobHit[];
};
const NO_HITS: GlobalHits = { products: [], customers: [], invoices: [], serviceJobs: [] };

const SALESPERSON_RESTRICTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/employees",
  "/attendance",
  "/payroll",
  "/expenses",
  "/banking",
  "/shift-report",
  "/reports",
  "/open-accounts",
];

export function CommandPalette({
  nonTaxableEnabled,
  userRole,
}: {
  nonTaxableEnabled: boolean;
  userRole: Role;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // One round trip covers products, customers, invoices and service jobs. The
  // hook returns an array, so the single response is wrapped in one element.
  const globalSearch = useRemoteSearch<GlobalHits>({
    url: (q) => `/api/search?q=${encodeURIComponent(q)}`,
    select: (data) => [data as GlobalHits],
    minLength: 2,
    delay: 180,
  });
  const {
    query,
    setQuery,
    results: hitGroups,
    isLoading: searching,
    error: searchError,
    reset: resetSearch,
  } = globalSearch;
  const hits = hitGroups[0] ?? NO_HITS;
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    resetSearch();
    setActive(0);
  }, [resetSearch]);

  const openPalette = useCallback(() => {
    resetSearch();
    setActive(0);
    setOpen(true);
  }, [resetSearch]);

  // Global ⌘K / Ctrl+K toggle, plus a custom event the header button fires.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (v) return false;
          return true;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("madagama:command-palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("madagama:command-palette", openPalette);
    };
  }, [openPalette]);

  // Focus the input + lock body scroll while open (external syncs only).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const staticMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...ACTIONS, ...PAGES].filter((command) => {
      if (!nonTaxableEnabled && (command.href === "/lolc-receipt" || command.href.startsWith("/lolc-receipt/"))) return false;
      if (
        !canAccessStaffFinance(userRole) &&
        SALESPERSON_RESTRICTED_PREFIXES.some(
          (prefix) => command.href === prefix || command.href.startsWith(prefix + "/"),
        )
      ) {
        return false;
      }
      return true;
    });
    if (!q) return all;
    return all.filter((c) => c.label.toLowerCase().includes(q) || c.sub?.toLowerCase().includes(q));
  }, [query, nonTaxableEnabled, userRole]);

  const items: Cmd[] = useMemo(
    () => [
      ...staticMatches,
      ...hits.products.map<Cmd>((h) => ({
        id: `prod-${h.id}`,
        group: "Products",
        label: h.name,
        sub: `${h.shortCode != null ? `#${h.shortCode} · ` : ""}${h.code} · ${formatLKR(h.sellingPrice)} · stock ${h.stock}`,
        icon: Package,
        href: `/products/${h.id}`,
      })),
      ...hits.customers.map<Cmd>((h) => ({
        id: `cust-${h.id}`,
        group: "Customers",
        label: h.name,
        sub: [h.phone, h.nic].filter(Boolean).join(" · "),
        icon: Users,
        href: `/customers/${h.id}`,
      })),
      ...hits.invoices.map<Cmd>((h) => ({
        id: `inv-${h.id}`,
        group: "Invoices",
        label: h.invoiceNumber,
        sub: `${h.customerName ?? "Walk-in"} · ${formatLKR(h.grandTotal)}`,
        icon: ReceiptText,
        href: `/invoices/${h.id}`,
      })),
      ...hits.serviceJobs.map<Cmd>((h) => ({
        id: `svc-${h.id}`,
        group: "Service jobs",
        label: `${h.jobNumber} · ${h.itemName}`,
        sub: `${h.customerName ?? "No customer"} · ${h.status.replaceAll("_", " ")}`,
        icon: Wrench,
        href: `/services/${h.id}`,
      })),
    ],
    [staticMatches, hits],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(0);
  }, [items.length]);

  const run = useCallback(
    (cmd: Cmd | undefined) => {
      if (!cmd) return;
      close();
      router.push(cmd.href);
    },
    [router, close],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  // Keep the active row scrolled into view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="motion-backdrop-in fixed inset-0 z-[70] flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="motion-menu-in w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, actions, products…"
            className="h-14 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-faint"
          />
          {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-faint" />}
          <kbd className="hidden shrink-0 rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] font-semibold text-faint sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2 scrollbar-thin">
          {items.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-muted">
              {searchError
                ? "Product search is unavailable — check the connection."
                : `No matches for “${query}”.`}
            </div>
          ) : (
            items.map((cmd, i) => {
              const Icon = cmd.icon;
              const header = cmd.group !== lastGroup ? cmd.group : null;
              lastGroup = cmd.group;
              return (
                <div key={cmd.id}>
                  {header && (
                    <p className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                      {header}
                    </p>
                  )}
                  <button
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(cmd)}
                    className={`motion-interactive flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                      i === active ? "bg-primary-soft" : "hover:bg-border-subtle"
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] shrink-0 ${i === active ? "text-primary-ink" : "text-faint"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-foreground">{cmd.label}</span>
                      {cmd.sub && <span className="block truncate text-[11.5px] text-muted">{cmd.sub}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
