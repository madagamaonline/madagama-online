import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { signUploadTicket } from "@/lib/upload-ticket";

// Issues a short-lived upload ticket for the "scan with phone" flow. Session-gated
// (NOT in the proxy's public list) so only a signed-in staff member can mint one.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const raw = typeof body.folder === "string" ? body.folder : "nic";
  const folder = raw.replace(/[^a-z0-9_-]/gi, "") || "nic";

  const { token } = await signUploadTicket(folder);
  return NextResponse.json({ token });
}
