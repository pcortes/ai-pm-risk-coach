import { NextRequest, NextResponse } from "next/server";
import { appendUsageEntry, readUsageEntries } from "@/lib/coach/storage";
import { getActiveContext } from "@/lib/coach/active-context";
import { CoachUsageEntry } from "@/lib/coach/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await readUsageEntries();
    return NextResponse.json({ entries: entries.slice(-50).reverse() });
  } catch (error) {
    console.error("Failed to read entries:", error);
    return NextResponse.json({ entries: [], error: "Failed to read entries" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CoachUsageEntry>;
    if (!body.prompt || !body.tool) {
      return NextResponse.json({ error: "tool and prompt are required" }, { status: 400 });
    }

    const activeContext = await getActiveContext();

    const entry: CoachUsageEntry = {
      timestamp: body.timestamp ?? new Date().toISOString(),
      tool: body.tool,
      prompt: body.prompt,
      response: body.response ?? null,
      minutes: Math.max(0, body.minutes ?? 0),
      tags: body.tags ?? [],
      outcome: body.outcome ?? null,
      notes: body.notes ?? null,
      contextAppName: body.contextAppName ?? activeContext.appName,
      contextWindowTitle: body.contextWindowTitle ?? activeContext.windowTitle,
      contextWorkMode: body.contextWorkMode ?? activeContext.workMode,
      source: body.source ?? "manual",
      promptCaptureMode: body.promptCaptureMode ?? "full_prompt",
      sessionStartedAt: body.sessionStartedAt ?? null,
      sessionEndedAt: body.sessionEndedAt ?? null,
    };

    await appendUsageEntry(entry);
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    console.error("Failed to append entry:", error);
    return NextResponse.json({ error: "Failed to append entry" }, { status: 500 });
  }
}
