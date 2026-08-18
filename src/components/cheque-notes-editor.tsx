"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { updateChequeNotes } from "@/app/(app)/banking/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Notes stay editable after issue — they annotate the cheque, they do not move money. */
export function ChequeNotesEditor({ chequeId, notes }: { chequeId: string; notes: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save(formData: FormData) {
    startSaving(async () => {
      const result = await updateChequeNotes(chequeId, {}, formData);
      if (result.error) return setError(result.error);
      setError(null);
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div>
        <dt className="flex items-center justify-between gap-2 text-xs text-muted">
          Notes
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <Pencil className="h-3 w-3" /> {notes ? "Edit" : "Add"}
          </button>
        </dt>
        <dd className={`mt-1 whitespace-pre-wrap ${notes ? "" : "text-muted"}`}>{notes || "No notes yet."}</dd>
      </div>
    );
  }

  return (
    <form action={save}>
      <dt className="text-xs text-muted">Notes</dt>
      <dd className="mt-1 space-y-2">
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-ink">{error}</p>}
        <Textarea name="notes" rows={4} defaultValue={notes ?? ""} placeholder="Add a note about this cheque…" autoFocus />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setError(null); setEditing(false); }} disabled={saving}>
            Cancel
          </Button>
        </div>
      </dd>
    </form>
  );
}
