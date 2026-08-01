import type { ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export function ActionButtonContent({
  pending,
  success = false,
  idleLabel,
  pendingLabel,
  successLabel = "Saved",
  idleIcon,
}: {
  pending: boolean;
  success?: boolean;
  idleLabel: string;
  pendingLabel: string;
  successLabel?: string;
  idleIcon?: ReactNode;
}) {
  if (success) return <><CheckCircle2 className="motion-check-in h-4 w-4" />{successLabel}</>;
  if (pending) return <><Loader2 className="h-4 w-4 animate-spin" />{pendingLabel}</>;
  return <>{idleIcon}{idleLabel}</>;
}

export function ActionFeedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (error) {
    return <p role="alert" className="motion-panel-in rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>;
  }
  if (success) {
    return <p role="status" className="motion-panel-in flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm text-success-ink"><CheckCircle2 className="motion-check-in h-4 w-4" />{success}</p>;
  }
  return null;
}

/** Brief confirmation frame before a redirect; reduced-motion users continue immediately. */
export async function waitForSuccessFrame(duration = 300) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  await new Promise((resolve) => window.setTimeout(resolve, duration));
}
