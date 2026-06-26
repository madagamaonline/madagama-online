"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addServiceJobNote } from "@/app/(app)/services/actions";

export function ServiceAddNote({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!note.trim()) return;
    setErr("");
    start(async () => {
      const r = await addServiceJobNote(id, note);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setNote("");
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
        {pending ? "Adding…" : "Add note"}
      </Button>
      {err && <p className="text-xs text-danger">{err}</p>}
    </div>
  );
}
