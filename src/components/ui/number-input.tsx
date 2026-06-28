"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Money / large-number input with live thousands separators.
//
// The visible field is a plain text box that groups digits as you type
// ("1,250,000.00"). The grouped string is NEVER submitted: when `name` is set
// we emit a sibling hidden <input> carrying the *clean* numeric string (no
// commas), so server actions keep receiving a parseable number and nothing
// downstream changes. For controlled use, `onValueChange` reports that same
// clean string.
// ---------------------------------------------------------------------------

/** Keep only digits and (optionally) a single decimal point; drop leading zeros. */
function clean(raw: string, allowDecimal: boolean): string {
  let r = raw.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, "");
  if (allowDecimal) {
    const i = r.indexOf(".");
    if (i !== -1) r = r.slice(0, i + 1) + r.slice(i + 1).replace(/\./g, "");
  }
  return r.replace(/^0+(?=\d)/, ""); // "007" -> "7", but keep "0" and "0.5"
}

/** Group the integer part of an already-clean numeric string with commas. */
function group(cleanStr: string): string {
  if (cleanStr === "") return "";
  const [int, dec] = cleanStr.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

function toStr(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

export interface NumberInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "defaultValue" | "onChange" | "type" | "inputMode"
  > {
  /** When set, a hidden input with this name submits the clean numeric value. */
  name?: string;
  /** Controlled clean value (number or numeric string). */
  value?: number | string;
  /** Uncontrolled initial value. */
  defaultValue?: number | string;
  /** Fires on every edit with the clean numeric string (no commas). */
  onValueChange?: (clean: string) => void;
  /** Allow a decimal point (default true). Set false for whole-number money. */
  allowDecimal?: boolean;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    { name, value, defaultValue, onValueChange, allowDecimal = true, ...rest },
    ref,
  ) {
    const controlled = value !== undefined;
    const innerRef = React.useRef<HTMLInputElement>(null);
    const [display, setDisplay] = React.useState(() =>
      group(clean(toStr(controlled ? value : defaultValue), allowDecimal)),
    );

    // Re-sync when the controlled value is changed from the outside (e.g. a
    // "apply target margin" button). We compare numerically so we don't clobber
    // an in-progress decimal the user is typing ("1,234." while the parent has
    // already rounded it back to 1234).
    React.useEffect(() => {
      if (!controlled) return;
      const incoming = clean(toStr(value), allowDecimal);
      setDisplay((cur) =>
        Number(clean(cur, allowDecimal) || "0") === Number(incoming || "0")
          ? cur
          : group(incoming),
      );
    }, [value, controlled, allowDecimal]);

    // Because the visible field is React-controlled, a native form.reset() won't
    // clear it — so we listen for the form's reset and re-seed from defaultValue.
    React.useEffect(() => {
      if (controlled) return;
      const form = innerRef.current?.form;
      if (!form) return;
      const onReset = () =>
        setDisplay(group(clean(toStr(defaultValue), allowDecimal)));
      form.addEventListener("reset", onReset);
      return () => form.removeEventListener("reset", onReset);
    }, [controlled, defaultValue, allowDecimal]);

    return (
      <>
        <Input
          ref={(node) => {
            innerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          {...rest}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          value={display}
          onChange={(e) => {
            const c = clean(e.target.value, allowDecimal);
            setDisplay(group(c));
            onValueChange?.(c);
          }}
        />
        {name !== undefined && (
          <input type="hidden" name={name} value={clean(display, allowDecimal)} />
        )}
      </>
    );
  },
);
