import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readUpload, contentTypeFor } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key: parts } = await params;
  const key = parts.join("/");
  const buf = await readUpload(key);
  if (!buf) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentTypeFor(key),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
