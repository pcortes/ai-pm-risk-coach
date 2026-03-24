import { describe, expect, it } from "vitest";
import { buildMemoryProfile } from "./profile";
import { ActivitySample, CoachUsageEntry } from "./types";

describe("buildMemoryProfile", () => {
  it("learns from both activity context and logged AI usage", () => {
    const entries: CoachUsageEntry[] = [
      {
        timestamp: "2026-03-24T10:15:00-07:00",
        tool: "chatgpt",
        prompt:
          "I am preparing a leadership memo on an AI risk escalation path. Give me options, tradeoffs, recommendation, and open questions in bullet format.",
        minutes: 18,
        tags: ["ai-risk", "leadership"],
        outcome: "Used in leadership prep",
        notes: "Decision memo drafting",
        contextAppName: "Google Chrome",
        contextWindowTitle: "Policy notes",
        contextWorkMode: "browser",
      },
      {
        timestamp: "2026-03-24T14:00:00-07:00",
        tool: "claude",
        prompt:
          "Design an evaluation plan for this AI risk policy question. Include failure modes, edge cases, scoring rubric, and likely false positives.",
        minutes: 24,
        tags: ["ai-risk", "evals"],
        outcome: "Drafted eval plan",
        notes: "Prep for review",
        contextAppName: "Docs",
        contextWindowTitle: "Eval draft",
        contextWorkMode: "docs",
      },
    ];

    const activitySamples: ActivitySample[] = [
      { timestamp: "2026-03-24T09:00:00-07:00", appName: "Google Chrome", windowTitle: "Research tab", workMode: "browser" },
      { timestamp: "2026-03-24T09:10:00-07:00", appName: "Google Chrome", windowTitle: "Research tab", workMode: "browser" },
      { timestamp: "2026-03-24T11:30:00-07:00", appName: "Google Chrome", windowTitle: "Research tab", workMode: "browser" },
      { timestamp: "2026-03-24T13:10:00-07:00", appName: "Docs", windowTitle: "Draft memo", workMode: "docs" },
      { timestamp: "2026-03-24T15:00:00-07:00", appName: "Slack", windowTitle: "Reviewer thread", workMode: "slack" },
    ];

    const profile = buildMemoryProfile(entries, activitySamples);

    expect(profile.daysTracked).toBe(1);
    expect(profile.totalInteractions).toBe(2);
    expect(profile.topTools[0]).toEqual({ name: "chatgpt", count: 1 });
    expect(profile.topObservedWorkModes[0].name).toBe("browser");
    expect(profile.learnedFacts.some((fact) => fact.label === "Most observed context")).toBe(true);
    expect(profile.behavioralPatterns.some((pattern) => pattern.title.includes("Work clusters"))).toBe(true);
    expect(profile.coachingHypotheses.length).toBeGreaterThan(0);
    expect(profile.opportunityGaps.some((gap) => gap.workMode === "slack")).toBe(true);
    expect(profile.summary).toContain("browser");
  });
});
