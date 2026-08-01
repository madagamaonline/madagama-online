"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addServiceJobNote } from "@/app/(app)/services/actions";
import { ActionButtonContent, ActionFeedback } from "@/components/ui/action-feedback";

export function ServiceAddNote({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);

  function submit() {
    if (!note.trim()) return;
    setErr("");
    setAdded(false);
    start(async () => {
      const r = await addServiceJobNote(id, note);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setNote("");
      setAdded(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note to the timeline…"
      />
      <Button type="button" size="sm" disabled={pending} onClick={submit}>
        <ActionButtonContent pending={pending} success={added} idleLabel="Add note" pendingLabel="Adding…" successLabel="Note added" />
      </Button>
      <ActionFeedback error={err} success={added ? "Timeline note added." : undefined} />
    </div>
  );
}
