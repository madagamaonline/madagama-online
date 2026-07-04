import "server-only";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

// Read-only view of the off-site database backups stored in Cloudflare R2, plus
// the trigger that asks GitHub Actions to restore one. The actual restore runs
// in the `db-restore.yml` workflow (Vercel can't run psql) — here we only list
// the available backups and kick off that workflow.
//
// Required env (set in Vercel and .env):
//   R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   RESTORE_GITHUB_TOKEN  PAT with `repo` + `workflow` scope.
//   RESTORE_GITHUB_REPO   "owner/repo", e.g. madagamaonline/madagama-online.

export type BackupItem = { key: string; size: number; lastModified: string };

// Matches the names the backup workflow writes: madagama-<UTC stamp>.sql.gz.
const BACKUP_KEY_RE = /^madagama-\d{8}T\d{6}Z\.sql\.gz$/;

/** True when the R2 credentials needed to LIST backups are present. */
export function backupsConfigured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_BUCKET &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * True when the GitHub credentials needed to dispatch a workflow (manual backup
 * or restore) are present. The same PAT covers both — it authorizes
 * `workflow_dispatch` on any workflow in the repo.
 */
export function restoreConfigured(): boolean {
  return Boolean(process.env.RESTORE_GITHUB_TOKEN && process.env.RESTORE_GITHUB_REPO);
}

/** Link to the restore workflow's runs, so the UI can point the admin at progress. */
export function restoreRunsUrl(): string | null {
  const repo = process.env.RESTORE_GITHUB_REPO;
  return repo ? `https://github.com/${repo}/actions/workflows/db-restore.yml` : null;
}

/** Link to the backup workflow's runs, so the UI can point the admin at progress. */
export function backupRunsUrl(): string | null {
  const repo = process.env.RESTORE_GITHUB_REPO;
  return repo ? `https://github.com/${repo}/actions/workflows/db-backup.yml` : null;
}

function r2(): S3Client | null {
  if (!backupsConfigured()) return null;
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
  });
}

/** List available backups, newest first. Returns [] if R2 isn't configured. */
export async function listBackups(): Promise<BackupItem[]> {
  const client = r2();
  if (!client) return [];
  const out = await client.send(
    new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 1000 }),
  );
  const items = (out.Contents ?? [])
    .filter((o): o is typeof o & { Key: string } => Boolean(o.Key && BACKUP_KEY_RE.test(o.Key)))
    .map((o) => ({
      key: o.Key,
      size: o.Size ?? 0,
      lastModified: (o.LastModified ?? new Date()).toISOString(),
    }));
  // The timestamp embedded in the key sorts lexicographically == chronologically.
  items.sort((a, b) => (a.key < b.key ? 1 : -1));
  return items;
}

/** POST a workflow_dispatch for `workflow` with optional `inputs`. */
async function dispatchWorkflow(
  workflow: string,
  inputs: Record<string, string> | undefined,
  what: string,
): Promise<void> {
  const token = process.env.RESTORE_GITHUB_TOKEN;
  const repo = process.env.RESTORE_GITHUB_REPO;
  if (!token || !repo) {
    throw new Error(`${what} is not configured (missing RESTORE_GITHUB_TOKEN / RESTORE_GITHUB_REPO).`);
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", ...(inputs ? { inputs } : {}) }),
    },
  );

  // A successful dispatch returns 204 No Content.
  if (res.status !== 204) {
    const detail = await res.text().catch(() => "");
    throw new Error(`GitHub could not start the ${what.toLowerCase()} (HTTP ${res.status}). ${detail.slice(0, 300)}`);
  }
}

/**
 * Ask GitHub Actions to restore `backupFile` into the live database via the
 * db-restore.yml workflow. The caller is responsible for authorization and for
 * having validated that `backupFile` is a real, existing backup.
 */
export async function dispatchRestore(backupFile: string): Promise<void> {
  if (!BACKUP_KEY_RE.test(backupFile)) {
    throw new Error("Invalid backup file name.");
  }
  await dispatchWorkflow(
    "db-restore.yml",
    { backup_file: backupFile, confirm: "RESTORE" },
    "Restore",
  );
}

/**
 * Ask GitHub Actions to take a fresh backup NOW via the db-backup.yml workflow
 * (the same pipeline as the nightly 01:30 Colombo run). The dump lands in the
 * R2 bucket a minute or two later with the usual madagama-<stamp>.sql.gz name.
 */
export async function dispatchBackup(): Promise<void> {
  await dispatchWorkflow("db-backup.yml", undefined, "Backup");
}
