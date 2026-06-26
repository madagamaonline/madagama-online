import { NextResponse } from "next/server";
import { saveUpload, putObject, readUpload } from "@/lib/storage";
import { verifyUploadTicket, ticketMarkerKey } from "@/lib/upload-ticket";

// PUBLIC route (whitelisted in proxy.ts) — the phone has no session, so it is
// authorized purely by the signed, short-lived ticket carried in `?t=`.
//   POST = the phone uploads one ID image.
//   GET  = the laptop polls for the image the phone just sent.

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const ticket = await verifyUploadTicket(token);
  if (!ticket) {
    return NextResponse.json(
      { error: "This upload link has expired. Please scan the QR code again." },
      { status: 401 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo received." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)." }, { status: 400 });
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Only images or PDF are allowed." }, { status: 400 });
  }

  const key = await saveUpload(file, ticket.folder);
  // Drop a marker the laptop can poll for — the storage layer is our cross-device
  // rendezvous, so no database table (and no migration) is needed.
  await putObject(
    ticketMarkerKey(ticket.jti),
    Buffer.from(JSON.stringify({ key })),
    "application/json",
  );

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const ticket = await verifyUploadTicket(token);
  if (!ticket) return NextResponse.json({ error: "expired" }, { status: 401 });

  const marker = await readUpload(ticketMarkerKey(ticket.jti));
  if (!marker) return NextResponse.json({ ready: false });
  try {
    const { key } = JSON.parse(marker.toString()) as { key: string };
    return NextResponse.json({ ready: true, key });
  } catch {
    return NextResponse.json({ ready: false });
  }
}
