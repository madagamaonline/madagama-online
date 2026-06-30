"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Confirm-then-delete button. `onDelete` is a bound server action that either
 * redirects on success or returns `{ error }` when the delete is blocked.
 */
export function DeleteButton({
  onDelete,
  confirmText,
  label = "Delete",
}: {
  onDelete: () => Promise<{ error?: string } | void>;
  confirmText: string;
  label?: string;
}) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  return (
    <span className="inline-flex items-center gap-2">
      {err && <span className="text-sm text-danger">{err}</span>}
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({ title: "Delete?", message: confirmText, confirmLabel: label });
          if (!ok) return;
          setErr("");
          start(async () => {
            const r = await onDelete();
            if (r && r.error) setErr(r.error);
          });
        }}
      >
        <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : label}
      </Button>
    </span>
  );
}
