import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness/readiness probe for external uptime monitoring (UptimeRobot, Better
// Stack, etc.). Public by design — see PUBLIC_PREFIXES in proxy.ts — so the
// monitor can reach it without a session. A trivial `SELECT 1` confirms the
// Neon connection is alive, which is the dependency most likely to take the app
// down. Never cache: the whole point is to reflect live state on every ping.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    // Log the real error server-side; keep the public body generic so a probe
    // endpoint can't leak connection details.
    console.error("[health] database check failed:", err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
