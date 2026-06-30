"use server";

import { prisma } from "@/lib/prisma";
import { getSession, verifyPassword } from "@/lib/auth";
import { listBackups, dispatchRestore } from "@/lib/backups";

export type RestoreState = { error?: string; ok?: boolean; backupFile?: string };

// Must match the phrase the user types in the confirmation box, kept in sync
// with the same literal in `system-restore.tsx` (a "use server" module can only
// export async functions, so it can't be shared as a const).
const CONFIRM_PHRASE = "OVERWRITE LIVE DATA";

/**
 * Trigger a restore of the chosen R2 backup INTO the live database. The work
 * itself runs in the db-restore.yml GitHub Actions workflow; this action just
 * authorizes the request and dispatches it.
 *
 * Guarded the same three ways as the system cleanup: (1) ADMIN session
 * re-checked here (a server action is just a POST endpoint), (2) the admin must
 * re-type a confirmation phrase, and (3) the admin must re-enter their own
 * password — a till PIN can switch into an admin session, so the session alone
 * is not trusted for an irreversible action.
 */
export async function restoreFromBackup(
  _prev: RestoreState,
  formData: FormData,
): Promise<RestoreState> {
  const me = await getSession();
  if (!me) return { error: "Your session has expired — please sign in again." };
  if (me.role !== "ADMIN") {
    return { error: "Only an admin can restore a backup." };
  }

  const backupFile = ((formData.get("backupFile") as string | null) ?? "").trim();
  if (!backupFile) return { error: "Choose a backup to restore." };

  const phrase = ((formData.get("confirmPhrase") as string | null) ?? "").trim();
  if (phrase !== CONFIRM_PHRASE) {
    return { error: `Type "${CONFIRM_PHRASE}" exactly to confirm.` };
  }

  const password = (formData.get("password") as string | null) ?? "";
  if (!password) return { error: "Enter your password to confirm." };

  const user = await prisma.user.findUnique({ where: { id: me.id } });
  if (!user) return { error: "Account not found — please sign in again." };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect password." };
  }

  // Re-validate the chosen file against R2 so a tampered form can't ask the
  // restore workflow to fetch something that isn't a current backup.
  const available = await listBackups();
  if (!available.some((b) => b.key === backupFile)) {
    return { error: "That backup no longer exists — refresh the page and try again." };
  }

  try {
    await dispatchRestore(backupFile);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to start the restore." };
  }

  return { ok: true, backupFile };
}
