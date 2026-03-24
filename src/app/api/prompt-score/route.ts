import { NextRequest, NextResponse } from "next/server";
import { assessPrompt } from "@/lib/coach/scoring";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { prompt?: string };
    const prompt = body.prompt?.trim() ?? "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const assessment = assessPrompt({
      timestamp: new Date().toISOString(),
      tool: "draft",
      prompt,
      minutes: 0,
      tags: [],
    });

    return NextResponse.json(assessment);
  } catch (error) {
    console.error("Failed to score prompt:", error);
    return NextResponse.json({ error: "Failed to score prompt" }, { status: 500 });
  }
}
