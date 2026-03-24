import { describe, expect, it } from "vitest";
import { assessPrompt } from "./scoring";
import { CoachUsageEntry } from "./types";

describe("assessPrompt", () => {
  it("rewards structured high-stakes prompts", () => {
    const entry: CoachUsageEntry = {
      timestamp: "2026-03-24T09:30:00-07:00",
      tool: "chatgpt",
      prompt:
        "I am preparing an AI risk decision memo for leadership. Give me context, options, tradeoffs, recommendation, counterarguments, and open questions in bullet format. Use reviewer-facing language and include decision criteria.",
      minutes: 20,
      tags: ["ai-risk", "leadership"],
      outcome: "Drafted memo",
      notes: "Used for policy decision prep",
    };

    const assessment = assessPrompt(entry);

    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.categories).toContain("leadership_brief");
    expect(assessment.categories).toContain("decision_analysis");
    expect(assessment.strengths).toContain("Includes useful context.");
    expect(assessment.rewrite.length).toBeGreaterThan(40);
  });
});
