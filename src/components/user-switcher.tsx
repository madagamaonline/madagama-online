"use client";

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Users, Lock, ChevronDown, UserCheck, ShieldAlert, X, Loader2 } from "lucide-react";
import { getActiveLoginUsers, switchUser, type LoginUserInfo } from "@/app/(app)/account-actions";

type CurrentUser = { id: string; name: string; role: "ADMIN" | "STAFF" };

const roleLabel = (r: "ADMIN" | "STAFF") => (r === "ADMIN" ? "Admin" : "Cashier");

export function UserSwitcher({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const [users, setUsers] = useState<LoginUserInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<LoginUserInfo | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) getActiveLoginUsers().then(setUsers).catch(console.error);
  }, [isOpen]);

  const open = () => {
    setError("");
    setPin("");
    setSelected(null);
    setIsOpen(true);
  };
  const close = () => {
    setIsOpen(false);
    setSelected(null);
    setPin("");
    setError("");
  };

  const pickUser = (u: LoginUserInfo) => {
    if (u.isCurrent) return;
    if (!u.hasPin) {
      setError(`${u.name} has no quick-switch PIN. Set one in Settings → Users.`);
      return;
    }
    setError("");
    setPin("");
    setSelected(u);
  };

  const submitPin = (value: string) => {
    if (!selected) return;
    startTransition(async () => {
      const res = await switchUser(selected.id, value);
      if (res.ok) {
        close();
        router.refresh();
      } else {
        setError(res.error);
        setPin("");
      }
    });
  };

  const pressDigit = (d: string) => {
    if (pending) return;
    setError("");
    const next = pin + d;
    if (next.length <= 4) {
      setPin(next);
      if (next.length === 4) submitPin(next);
    }
  };
  const backspace = () => {
    if (pending) return;
    setError("");
    setPin((p) => p.slice(0, -1));
  };
  const clearPin = () => {
    if (pending) return;
    setError("");
    setPin("");
  };

  // Keyboard support for PIN entry.
  useEffect(() => {
    if (!selected || !isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape") {
        setSelected(null);
        setPin("");
        setError("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, pin, isOpen, pending]);

  return (
    <>
      <button
        onClick={open}
        className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-border-subtle cursor-pointer transition-colors shadow-xs"
        aria-label="Switch active user"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5 text-primary-ink" />
          <span className="max-w-[110px] truncate">{currentUser.name}</span>
          <span className="text-faint">· {roleLabel(currentUser.role)}</span>
        </span>
        <ChevronDown className="h-3 w-3 text-faint" />
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <button
                onClick={close}
                disabled={pending}
                className="absolute right-4 top-4 rounded-full p-1 text-muted hover:bg-border-subtle hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              {!selected ? (
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
                    <Users className="h-5 w-5 text-primary-ink" />
                    Switch user
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Take over the till as another family member, secured by their PIN.
                  </p>

                  <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                    {users.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted">Loading users…</div>
                    ) : (
                      users.map((u) => {
                        const switchable = !u.isCurrent && u.hasPin;
                        return (
                          <button
                            key={u.id}
                            onClick={() => pickUser(u)}
                            disabled={u.isCurrent || !u.hasPin}
                            className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                              u.isCurrent
                                ? "border-primary bg-primary-soft text-primary-ink"
                                : switchable
                                  ? "cursor-pointer border-border hover:border-muted-border hover:bg-border-subtle"
                                  : "cursor-not-allowed border-border opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                                  u.isCurrent ? "bg-primary text-primary-foreground" : "bg-border text-muted"
                                }`}
                              >
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-[13px] font-bold">{u.name}</p>
                                <p className="text-[10px] text-faint">
                                  {roleLabel(u.role)}
                                  {u.isCurrent
                                    ? " · Active now"
                                    : u.hasPin
                                      ? " · PIN protected"
                                      : " · No PIN set"}
                                </p>
                              </div>
                            </div>
                            {!u.isCurrent && u.hasPin && <Lock className="h-3.5 w-3.5 shrink-0 text-faint" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {error && (
                    <p className="mt-3 flex items-center justify-center gap-1 text-[11px] font-semibold text-danger">
                      <ShieldAlert className="h-3 w-3" />
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <h3 className="text-base font-bold text-foreground">Verify identity</h3>
                  <p className="mt-0.5 text-center text-xs text-muted">
                    Enter PIN for <span className="font-semibold text-foreground">{selected.name}</span>
                  </p>

                  <div className="mt-5 flex gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-4.5 w-4.5 rounded-full border transition-all duration-100 ${
                          pin.length > i
                            ? "scale-110 border-primary bg-primary shadow-xs"
                            : "border-border bg-border/20"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="mt-3 h-5 text-center">
                    {error && (
                      <p className="flex items-center justify-center gap-1 text-[11px] font-semibold text-danger">
                        <ShieldAlert className="h-3 w-3" />
                        {error}
                      </p>
                    )}
                    {pending && (
                      <span className="flex items-center justify-center gap-1.5 text-xs text-muted">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        Switching…
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid w-full max-w-[240px] grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={pending}
                        onClick={() => pressDigit(n)}
                        className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-base font-bold text-foreground hover:bg-border-subtle active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={pending || pin.length === 0}
                      onClick={clearPin}
                      className="flex h-12 items-center justify-center rounded-xl text-xs font-bold text-muted hover:bg-border-subtle active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pressDigit("0")}
                      className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface text-base font-bold text-foreground hover:bg-border-subtle active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      disabled={pending || pin.length === 0}
                      onClick={backspace}
                      className="flex h-12 items-center justify-center rounded-xl text-xs font-bold text-muted hover:bg-border-subtle active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setSelected(null);
                      setPin("");
                      setError("");
                    }}
                    disabled={pending}
                    className="mt-5 text-xs font-semibold text-primary hover:underline cursor-pointer disabled:opacity-50"
                  >
                    Back to users
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
