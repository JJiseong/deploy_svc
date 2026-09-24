import { NextResponse } from "next/server";
import { checkDatabaseReady } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await checkDatabaseReady();
    return NextResponse.json({ status: "ready", database: "ok" }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "not_ready", database: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
