import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// `/scan-upload` (the phone capture page) and `/api/scan-upload` (its upload +
// poll endpoint) are public because the phone has no session — they are
// authorized by the signed ticket in the URL instead. Note `/api/scan-ticket`
// (which MINTS tickets) is deliberately NOT here, so it stays session-gated.
// `/api/health` is public so external uptime monitors can ping it without a
// session — it only ever returns a status flag, never any data.
// `/manifest.webmanifest` and `/sw.js` are public so the browser can fetch them
// pre-login (e.g. on the login page) to keep the app installable — neither
// exposes any data. The proxy `matcher` already skips image assets, so the PWA
// icons under `/icons` don't need listing here.
const PUBLIC_PREFIXES = ["/login", "/api/auth/login", "/api/cron", "/api/health", "/scan-upload", "/api/scan-upload", "/manifest.webmanifest", "/sw.js"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/")) || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySession(token) : null;

  if (!user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
