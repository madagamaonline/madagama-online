import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide",
  {
    variants: {
      tone: {
        gray: "bg-border-subtle text-muted",
        green: "bg-primary-soft text-primary-ink",
        red: "bg-danger-soft text-danger-ink",
        amber: "bg-clay-soft text-clay-ink",
        blue: "bg-primary-soft text-primary-ink",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
