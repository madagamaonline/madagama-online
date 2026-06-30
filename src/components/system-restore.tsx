"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import {
  restoreFromBackup,
  type RestoreState,
} from "@/app/(app)/settings/restore-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

// Must match CONFIRM_PHRASE in restore-actions.ts.
const CONFIRM_PHRASE = "OVERWRITE LIVE DATA";

export type BackupOption = { key: string; size: number; lastModified: string };

const initial: RestoreState = {};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// madagama-20260630T065742Z.sql.gz -> "2026-06-30 06:57 UTC · 9.3 KB"
function optionLabel(key: string, size: number): string {
  const m = key.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\d{2}Z/);
  const when = m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} UTC` : key;
  return `${when} · ${humanSize(size)}`;
}

export function SystemRestore({
  backups,
  configured,
  runsUrl,
}: {
  backups: BackupOption[];
  configured: boolean;
  runsUrl: string | null;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [selected, setSelected] = useState(backups[0]?.key ?? "");
  const [state, action, pending] = useActionState(restoreFromBackup, initial);

  useEffect(() => {
    // On success the success branch below renders regardless of `armed`, so we
    // only need to re-sync the rest of the app with the freshly restored data.
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <Card className="border-danger/40">
      <CardHeader className="border-danger/20">
        <CardTitle className="flex items-center gap-2 text-danger">
          <RotateCcw className="h-4 w-4" /> Restore from backup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-muted">
          <p>
            Restore the database from a nightly off-site backup. The restore runs on
            GitHub and <strong>overwrites the live database</strong> — everything
            currently stored is replaced by the chosen backup, and any data entered
            after that backup was taken is lost. This <strong>cannot be undone</strong>.
          </p>
        </div>

        {!configured ? (
          <div className="rounded-lg bg-danger-soft/60 px-3 py-2 text-sm text-foreground">
            Restore isn&apos;t configured yet. Set <span className="font-mono">R2_ENDPOINT</span>,{" "}
            <span className="font-mono">R2_BUCKET</span>,{" "}
            <span className="font-mono">R2_ACCESS_KEY_ID</span>,{" "}
            <span className="font-mono">R2_SECRET_ACCESS_KEY</span>,{" "}
            <span className="font-mono">RESTORE_GITHUB_TOKEN</span> and{" "}
            <span className="font-mono">RESTORE_GITHUB_REPO</span> in the deployment
            environment.
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-lg bg-danger-soft/60 px-3 py-2 text-sm text-foreground">
            No backups found in the bucket yet. The nightly backup runs at 20:00 UTC
            (01:30 Colombo); the first one will appear after it has run.
          </div>
        ) : state.ok ? (
          <div className="space-y-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
            <p>
              ✓ Restore started for <span className="font-mono">{state.backupFile}</span>.
              It runs on GitHub and takes a minute or two.
            </p>
            {runsUrl && (
              <a
                href={runsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-medium underline"
              >
                Track progress on GitHub Actions →
              </a>
            )}
          </div>
        ) : !armed ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="restore-pick">Backup to restore</Label>
              <Select
                id="restore-pick"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {backups.map((b) => (
                  <option key={b.key} value={b.key}>
                    {optionLabel(b.key, b.size)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="button" variant="danger" onClick={() => setArmed(true)}>
              <RotateCcw className="h-4 w-4" /> Restore this backup…
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-3 rounded-lg bg-danger-soft/60 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-danger">
              <AlertTriangle className="h-4 w-4" /> This replaces the live database with{" "}
              <span className="font-mono">{optionLabel(selected, backups.find((b) => b.key === selected)?.size ?? 0)}</span>.
            </p>
            <p className="text-sm text-danger">
              To confirm, type <span className="font-mono">{CONFIRM_PHRASE}</span> and enter
              your password.
            </p>
            {/* Carry the chosen backup with the form submission. */}
            <input type="hidden" name="backupFile" value={selected} />
            <div>
              <Label htmlFor="restore-phrase">Confirmation</Label>
              <Input
                id="restore-phrase"
                name="confirmPhrase"
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="restore-password">Your password</Label>
              <Input
                id="restore-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Admin password"
              />
            </div>
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="danger"
                disabled={pending || phrase.trim() !== CONFIRM_PHRASE || !selected}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {pending ? "Starting restore…" : "Overwrite live database"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setArmed(false);
                  setPhrase("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
