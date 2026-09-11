import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (text: string) => { jobs: Record<string, { steps: { name: string; run?: string }[] }> } };
const workflow = yaml.load(readFileSync(".github/workflows/db-restore.yml", "utf8"));
const script = workflow.jobs.restore.steps.find((step) => step.name === "Download backup from R2 and restore")!.run!;

/** Exercise the actual workflow shell using local stand-ins for EVERY external
 * operation. No credentials, database clients or network tools are inherited.
 */
function simulate(failure = "") {
  const dir = mkdtempSync(path.join(tmpdir(), "madagama-restore-test-"));
  try {
    const bin = path.join(dir, "bin"); mkdirSync(bin);
    writeFileSync(path.join(dir, "source.gz"), failure === "corrupt" ? randomBytes(4096) : gzipSync(randomBytes(4096)));
    const stub = `#!${process.execPath}
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const name = path.basename(process.argv[1]), args = process.argv.slice(2), stage = process.env.FAILURE;
fs.appendFileSync('calls.log', JSON.stringify({name,args})+'\\n');
if (name === 'stat') { process.stdout.write(String(fs.statSync(args.at(-1)).size)); }
else if (name === 'pg_dump') { if(stage === 'snapshot') process.exit(1); process.stdout.write(crypto.randomBytes(4096).toString('hex')); }
else if (name === 'aws') {
  const source=args[2], target=args[3];
  if(source.startsWith('s3:') && source.includes('/pre-restore/')) fs.copyFileSync('safety.gz',target);
  else if(source.startsWith('s3:')) fs.copyFileSync('source.gz',target);
  else { if(stage === 'upload') process.exit(1); fs.copyFileSync(source,'safety.gz'); }
}
else if (name === 'sha256sum') {
  if(args.includes('--check')) { fs.readFileSync(0); process.exit(stage === 'checksum' ? 1 : 0); }
  process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(args[0])).digest('hex')+'  '+args[0]+'\\n');
}
else if (name === 'psql') { process.exit(stage === 'sql' ? 1 : 0); }
else process.exit(1);
`;
    for (const name of ["aws", "pg_dump", "psql", "stat", "sha256sum"]) writeFileSync(path.join(bin, name), stub, { mode: 0o755 });
    const result = spawnSync("/bin/bash", ["-c", script], {
      cwd: dir, encoding: "utf8", timeout: 10000,
      env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, BACKUP_DATABASE_URL: "postgresql://offline:offline@127.0.0.1:1/offline", R2_BUCKET: "mock", R2_ENDPOINT: "http://127.0.0.1:1", BACKUP_FILE: "madagama-20260911T000000Z.sql.gz", GITHUB_RUN_ID: "test", FAILURE: failure },
    });
    const calls = readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as { name: string; args: string[] });
    return { status: result.status, calls, output: result.stdout + result.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe("restore workflow offline", () => {
  it.each(["corrupt", "snapshot", "upload", "checksum"])("never starts SQL when %s verification fails", (failure) => {
    const result = simulate(failure);
    expect(result.status).not.toBe(0);
    expect(result.calls.some((call) => call.name === "psql")).toBe(false);
    if (failure === "corrupt") expect(result.calls.some((call) => call.name === "pg_dump")).toBe(false);
    else expect(result.calls.some((call) => call.name === "pg_dump")).toBe(true);
    if (failure === "checksum") expect(result.calls.some((call) => call.name === "sha256sum" && call.args.includes("--check"))).toBe(true);
  });
  it("requires a verified recovery copy before a single-transaction restore", () => {
    const result = simulate();
    expect(result.status, result.output).toBe(0);
    const sql = result.calls.find((call) => call.name === "psql")!;
    expect(sql.args).toContain("--single-transaction");
    expect(sql.args).toContain("-X");
    expect(sql.args).toContain("ON_ERROR_STOP=1");
    expect(sql.args).toContain("--file=restore.sql");
    const verification = result.calls.findIndex((call) => call.name === "sha256sum" && call.args.includes("--check"));
    expect(verification).toBeGreaterThan(-1);
    expect(result.calls.indexOf(sql)).toBeGreaterThan(verification);
  });
  it("propagates SQL failure instead of declaring success", () => {
    const result = simulate("sql"); expect(result.status).not.toBe(0); expect(result.output).not.toContain("Restore complete.");
  });
});
