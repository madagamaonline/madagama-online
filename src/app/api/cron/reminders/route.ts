import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured (dev) — allow
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReminders();
  return NextResponse.json({ ok: true, ...result });
}

export const POST = GET;
