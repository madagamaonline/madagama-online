"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogOut,
  Menu,
  ClipboardCheck,
  Undo2,
  Wrench,
  Bell,
  Search,
  FileText,
  MessageSquareText,
  Landmark,
  HandCoins,
  Tractor,
  CircleDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { canAccessStaffFinance } from "@/lib/authorization";
import { UserSwitcher } from "@/components/user-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { Pwa } from "@/components/pwa";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  requiresNonTaxableMode?: boolean;
  requiresStaffFinanceAccess?: boolean;
};
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiresStaffFinanceAccess: true },
      { href: "/reminders", label: "Reminders", icon: Bell },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/invoices/new", label: "New Sale", icon: ShoppingCart },
      { href: "/invoices", label: "Invoices", icon: ReceiptText },
      { href: "/open-accounts", label: "Customer Balances", icon: CircleDollarSign, requiresStaffFinanceAccess: true },
      { href: "/credit-invoices", label: "Credit Invoices", icon: CreditCard },
      { href: "/quotations", label: "Quotations", icon: FileText },
      { href: "/returns", label: "Returns", icon: Undo2 },
      { href: "/services", label: "Service Jobs", icon: Wrench },
      { href: "/requests", label: "Customer Requests", icon: MessageSquareText },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/credit", label: "Credit", icon: CreditCard },
      { href: "/vehicle-sales", label: "Vehicle Sales", icon: Tractor },
    ],
  },
  {
    title: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: Package },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
      { href: "/purchases", label: "Purchases", icon: PackagePlus },
      { href: "/supplier-returns", label: "Supplier Returns", icon: PackageX },
      { href: "/vehicles", label: "Consignment Vehicles", icon: Tractor },
    ],
  },
  {
    title: "Staff & Finance",
    items: [
      { href: "/employees", label: "Employees", icon: UserCog, requiresStaffFinanceAccess: true },
      { href: "/attendance", label: "Attendance", icon: CalendarCheck, requiresStaffFinanceAccess: true },
      { href: "/payroll", label: "Payroll", icon: Wallet, requiresStaffFinanceAccess: true },
      { href: "/expenses", label: "Expenses", icon: Receipt, requiresStaffFinanceAccess: true },
      { href: "/banking", label: "Bank & Cheques", icon: Landmark, requiresStaffFinanceAccess: true },
      { href: "/shift-report", label: "Shift Reports", icon: ClipboardCheck, requiresStaffFinanceAccess: true },
      { href: "/reports", label: "Reports", icon: TrendingUp, requiresStaffFinanceAccess: true },
    ],
  },
  {
    title: "Other",
    items: [
      {
        href: "/lolc-receipt",
        label: "LOLC Receipts",
        icon: HandCoins,
        requiresNonTaxableMode: true,
      },
    ],
  },
];

export function AppShell({
  user,
  businessName,
  nonTaxableEnabled,
  children,
}: {
  user: SessionUser;
  businessName: string;
  nonTaxableEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const visibleNav = NAV.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (nonTaxableEnabled || !item.requiresNonTaxableMode) &&
        (canAccessStaffFinance(user.role) || !item.requiresStaffFinanceAccess),
    ),
  })).filter((group) => group.items.length > 0);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
  }

  function handleNavClick(item: NavItem) {
    setOpen(false);
    if (item.href === "/invoices/new" && pathname === item.href) {
      window.dispatchEvent(new CustomEvent("madagama:start-new-sale"));
    }
  }

  function navLink(item: NavItem) {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => handleNavClick(item)}
        className={cn(
          "mb-0.5 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13.5px] transition-colors",
          active
            ? "bg-primary-soft font-semibold text-primary-ink"
            : "font-medium text-muted hover:bg-border-subtle hover:text-foreground",
        )}
      >
        <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-ink" : "text-faint")} />
        {item.label}
      </Link>
    );
  }

  function mobileTab(item: NavItem) {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => handleNavClick(item)}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
          active ? "text-primary-ink" : "text-faint",
        )}
      >
        <Icon className="h-[22px] w-[22px]" />
        {item.label}
      </Link>
    );
  }

  return (
    <ConfirmProvider>
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-border bg-sidebar transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-[62px] items-center gap-3 px-5">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-primary text-lg font-extrabold text-primary-foreground">
            M
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold leading-none tracking-tight text-foreground">
              {businessName}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
              Pvt Ltd · Retail
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
          {visibleNav.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.title && (
                <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-faint">
                  {group.title}
                </p>
              )}
              {group.items.map(navLink)}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border-subtle p-3">
          {canAccessStaffFinance(user.role) && navLink({ href: "/settings", label: "Settings", icon: Settings })}
          <div className="mt-2 flex items-center gap-2.5 rounded-[10px] px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-ink">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{user.name}</p>
              <p className="text-[11px] leading-tight text-faint">
                {user.role === "ADMIN" ? "Admin" : user.role === "SALESPERSON" ? "Salesperson" : "Cashier"}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-border-subtle bg-background/85 px-5 backdrop-blur-md lg:px-6 shadow-[0_1px_2px_rgba(30,41,74,0.02)]">
          <button
            className="rounded-lg p-2 text-muted hover:bg-border-subtle lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden" />
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("madagama:command-palette"))}
              className="flex h-9 items-center gap-2 rounded-xl border border-input-border bg-surface px-3 text-[13px] font-medium text-muted transition-colors hover:bg-input hover:text-foreground"
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] font-semibold text-faint sm:inline">
                ⌘K
              </kbd>
            </button>
            <ThemeToggle />
            <UserSwitcher currentUser={{ id: user.id, name: user.name, role: user.role }} />
            {/* Name/business block + avatar are redundant with the switcher and
                overflow the narrow mobile header — desktop only. */}
            <div className="hidden text-right lg:block">
              <p className="text-[13px] font-semibold leading-tight text-foreground">{user.name}</p>
              <p className="text-[11px] leading-tight text-faint">{businessName}</p>
            </div>
            <div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-ink lg:flex">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 px-5 pt-6 pb-24 lg:px-6 lg:py-6">
          <div key={pathname} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar — the primary "feels like an app" navigation on
          phones. Hidden at lg where the sidebar takes over. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {canAccessStaffFinance(user.role)
          ? mobileTab({ href: "/dashboard", label: "Home", icon: LayoutDashboard })
          : mobileTab({ href: "/invoices/new", label: "New Sale", icon: ShoppingCart })}
        {mobileTab({ href: "/reminders", label: "Reminders", icon: Bell })}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("madagama:command-palette"))}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-faint"
          aria-label="Search"
        >
          <Search className="h-[22px] w-[22px]" />
          Search
        </button>
        {mobileTab({ href: "/credit", label: "Credit", icon: CreditCard })}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium text-faint"
          aria-label="More"
        >
          <Menu className="h-[22px] w-[22px]" />
          More
        </button>
      </nav>

      <Pwa />
      <CommandPalette nonTaxableEnabled={nonTaxableEnabled} userRole={user.role} />
    </div>
    </ConfirmProvider>
  );
}
