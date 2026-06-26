// One-off Backblaze B2 connectivity check. Reads creds from env (never prints the
// secret). Discovers the S3 endpoint/region from the account, lists buckets, and
// — if S3_BUCKET is set — does a real put/get/delete round-trip.
//   Run: node --env-file=.env scripts/b2-check.mjs
import {
  S3Client,
  ListBucketsCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const keyId = process.env.S3_ACCESS_KEY_ID;
const appKey = process.env.S3_SECRET_ACCESS_KEY;
if (!keyId || !appKey) {
  console.error("Missing S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY");
  process.exit(1);
}

// 1) Native B2 auth to discover the exact S3 endpoint for this account.
const auth = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
});
if (!auth.ok) {
  console.error(`B2 authorize failed: ${auth.status} ${await auth.text()}`);
  process.exit(1);
}
const info = await auth.json();
const s3ApiUrl = info.apiInfo?.storageApi?.s3ApiUrl;
const region = new URL(s3ApiUrl).host.split(".")[1]; // s3.<region>.backblazeb2.com
console.log("✓ Authorized. Discovered config:");
console.log(`   S3_ENDPOINT=${s3ApiUrl}`);
console.log(`   S3_REGION=${region}`);

// 2) Talk to the S3-compatible API.
const s3 = new S3Client({
  region,
  endpoint: s3ApiUrl,
  forcePathStyle: true,
  credentials: { accessKeyId: keyId, secretAccessKey: appKey },
});

const list = await s3.send(new ListBucketsCommand({}));
const names = (list.Buckets ?? []).map((b) => b.Name);
console.log(`\n✓ Buckets visible to this key: ${names.length ? names.join(", ") : "(none)"}`);

// 3) Round-trip test against S3_BUCKET, if provided.
const bucket = process.env.S3_BUCKET;
if (!bucket) {
  console.log("\n(Set S3_BUCKET to run a put/get/delete test.)");
  process.exit(0);
}
if (!names.includes(bucket)) {
  console.error(`\n✗ Bucket "${bucket}" not found. Create it first (or fix S3_BUCKET).`);
  process.exit(1);
}

const testKey = `_conn-test/${Date.now()}.txt`;
const payload = "madagama-b2-ok";
await s3.send(new PutObjectCommand({ Bucket: bucket, Key: testKey, Body: payload, ContentType: "text/plain" }));
const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }));
const body = await got.Body.transformToString();
await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));

if (body === payload) {
  console.log(`\n✓ PUT/GET/DELETE round-trip on "${bucket}" succeeded — B2 is wired up correctly.`);
} else {
  console.error(`\n✗ Round-trip mismatch: got "${body}"`);
  process.exit(1);
}
