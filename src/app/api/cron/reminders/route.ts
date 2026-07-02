import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

// Give the reminder batch headroom beyond the platform default (Hobby ~10s).
// Combined with the batched concurrent sends in runReminders, this keeps the
// cron from being killed mid-run. Vercel clamps this to the plan's ceiling.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Unset secret: allow in dev only. In production an open cron endpoint would
  // let anyone trigger SMS sends to customers at will.
  if (!secret) return process.env.NODE_ENV !== "production";
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
