"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup, Loader2, RefreshCw } from "lucide-react";
import { backupNow, type BackupState } from "@/app/(app)/settings/backup-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ISO timestamp -> "2026-07-04 09:15" in shop (Colombo) time, TZ-independent.
function colomboLabel(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleString("en-GB", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

export function SystemBackup({
  latest,
  configured,
  runsUrl,
}: {
  latest: { key: string; size: number; lastModified: string } | null;
  configured: boolean;
  runsUrl: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<BackupState>({});
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      setState(await backupNow());
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4" /> Off-site backups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm text-muted">
          <p>
            The database is backed up automatically every night at 01:30 (Sri Lanka
            time) to Cloudflare R2. Use the button to take an extra backup right
            now — for example just before a big stock take or a risky change.
          </p>
          <p>
            Last backup:{" "}
            {latest ? (
              <span className="font-medium text-foreground">
                {colomboLabel(latest.lastModified)} · {humanSize(latest.size)}
              </span>
            ) : (
              <span className="font-medium text-foreground">none yet</span>
            )}
          </p>
        </div>

        {!configured ? (
          <div className="rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay-ink">
            Manual backups aren&apos;t configured yet. Set{" "}
            <span className="font-mono">RESTORE_GITHUB_TOKEN</span> and{" "}
            <span className="font-mono">RESTORE_GITHUB_REPO</span> in the deployment
            environment (the same credentials the restore card uses).
          </div>
        ) : state.ok ? (
          <div className="space-y-2 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-ink">
            <p>
              ✓ Backup started. It runs on GitHub and appears above (and in the
              restore list) in a minute or two.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {runsUrl && (
                <a
                  href={runsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline"
                >
                  Track progress on GitHub Actions →
                </a>
              )}
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center gap-1 font-medium underline"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh list
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {state.error && <p className="text-sm text-danger">{state.error}</p>}
            <Button type="button" onClick={start} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DatabaseBackup className="h-4 w-4" />
              )}
              {pending ? "Starting backup…" : "Back up now"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
