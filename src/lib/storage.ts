import "server-only";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

// File storage abstraction.
//  - STORAGE_DRIVER=local (default): saves to ./uploads — good for development.
//  - STORAGE_DRIVER=s3: saves to an S3 bucket — required in production on Vercel
//    (its filesystem is ephemeral, so local uploads would not persist).
const DRIVER = process.env.STORAGE_DRIVER ?? "local";
const ROOT = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

export function contentTypeFor(key: string): string {
  return MIME[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}

let _s3: S3Client | null = null;
function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return _s3;
}

/** Write raw bytes at an exact key (used by saveUpload and the scan-ticket marker). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (DRIVER === "s3") {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }

  // Vercel's filesystem is ephemeral — a local write here would be silently lost
  // when the container recycles, taking customer/guarantor NIC images with it.
  // Fail loudly so this is caught at upload time, not discovered later as data loss.
  if (process.env.VERCEL) {
    throw new Error(
      "Refusing to save uploads to the local filesystem on Vercel (ephemeral). Set STORAGE_DRIVER=s3 and the S3_* env vars.",
    );
  }

  const full = path.join(ROOT, key);
  if (!full.startsWith(ROOT)) throw new Error("Invalid storage key");
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

export async function saveUpload(file: File, folder = "nic"): Promise<string> {
  const ext = path.extname(file.name).toLowerCase() || ".bin";
  const key = `${folder}/${crypto.randomUUID()}${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await putObject(key, buf, file.type || contentTypeFor(key));
  return key;
}

export async function readUpload(key: string): Promise<Buffer | null> {
  if (DRIVER === "s3") {
    try {
      const res = await s3().send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  try {
    const full = path.join(ROOT, key);
    if (!full.startsWith(ROOT)) return null; // prevent path traversal
    return await fs.readFile(full);
  } catch {
    return null;
  }
}
