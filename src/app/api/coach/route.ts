import { NextResponse } from "next/server";
import { buildCoachSnapshot } from "@/lib/coach/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await buildCoachSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Failed to build coach snapshot:", error);
    return NextResponse.json({ error: "Failed to build coach snapshot" }, { status: 500 });
  }
}
