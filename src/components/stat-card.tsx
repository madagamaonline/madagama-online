import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ElementType;
  tone?: "default" | "green" | "amber" | "red" | "blue";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-border-subtle text-muted",
    green: "bg-primary-soft text-primary-ink",
    amber: "bg-clay-soft text-clay-ink",
    red: "bg-danger-soft text-danger-ink",
    blue: "bg-primary-soft text-primary-ink",
  };

  const borderClasses: Record<string, string> = {
    default: "",
    green: "border-l-4 border-l-primary pl-4",
    amber: "border-l-4 border-l-clay pl-4",
    red: "border-l-4 border-l-danger pl-4",
    blue: "border-l-4 border-l-primary pl-4",
  };

  const valueColorClasses: Record<string, string> = {
    default: "text-foreground",
    green: "text-primary-ink",
    amber: "text-clay-ink",
    red: "text-danger-ink",
    blue: "text-primary-ink",
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(30,41,74,0.05)] transition-all",
        borderClasses[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium text-muted">{label}</p>
          <p className={cn("tabular mt-1.5 text-2xl font-extrabold tracking-tight", valueColorClasses[tone])}>
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]", toneClasses[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>
    </div>
  );
}

