import { NextResponse } from "next/server";
import { discoverSessions } from "@/lib/discovery";
import { ensureHooksInstalled, areHooksInstalled } from "@/lib/hooks-installer";
import { buildCooDashboardSummary } from "@/lib/coo-state";

export const dynamic = "force-dynamic";

let hookInstallAttempted = false;

export async function GET() {
  try {
    if (!hookInstallAttempted) {
      hookInstallAttempted = true;
      await ensureHooksInstalled();
    }

    const sessions = await discoverSessions();
    const coo = await buildCooDashboardSummary(sessions);
    return NextResponse.json({ sessions, hooksActive: areHooksInstalled(), coo });
  } catch (error) {
    console.error("Failed to discover sessions:", error);
    return NextResponse.json({ sessions: [], hooksActive: false, error: "Discovery failed" }, { status: 500 });
  }
}
