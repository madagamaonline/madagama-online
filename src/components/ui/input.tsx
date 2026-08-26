import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, onWheel, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-input-border bg-input px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60",
      className,
    )}
    // A focused number input eats the wheel and changes its own value while the
    // page scrolls. Drop focus instead so scrolling never edits what was typed.
    onWheel={(e) => {
      if (props.type === "number" && document.activeElement === e.currentTarget) {
        e.currentTarget.blur();
      }
      onWheel?.(e);
    }}
    {...props}
  />
));
Input.displayName = "Input";
