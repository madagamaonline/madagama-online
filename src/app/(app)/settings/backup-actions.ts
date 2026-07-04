"use server";

import { getSession } from "@/lib/auth";
import { dispatchBackup } from "@/lib/backups";

export type BackupState = { error?: string; ok?: boolean };

/**
 * Kick off an on-demand off-site backup. The dump itself runs in the
 * db-backup.yml GitHub Actions workflow (Vercel can't run pg_dump); this action
 * just authorizes the request and dispatches it. Creating a backup is safe —
 * unlike restore/reset it needs no confirmation phrase or password, only an
 * ADMIN session (the action is a POST endpoint, so the role is re-checked here).
 */
export async function backupNow(): Promise<BackupState> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") {
    return { error: "Only an admin can start a backup." };
  }

  try {
    await dispatchBackup();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start the backup." };
  }

  return { ok: true };
}
