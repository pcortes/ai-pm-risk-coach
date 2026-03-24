import { describe, expect, it } from "vitest";
import { buildSessionMonitor, coachSession } from "./session-intelligence";
import type { ClaudeSession } from "../monitor/types";

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "session-1",
    provider: "claude",
    pid: 1234,
    workingDirectory: "/Users/philipjcortes/coo",
    repoName: "coo",
    branch: "feature/coach",
    status: "waiting",
    lastActivity: "2026-03-24T17:00:00.000Z",
    startedAt: "2026-03-24T16:30:00.000Z",
    preview: {
      lastUserMessage:
        "Design an evaluation harness for this AI risk launch. I need a rubric, adversarial cases, pass/fail thresholds, and likely reviewer objections.",
      lastAssistantText: "I can draft the harness. Would you like me to rank the failure modes by severity first?",
      assistantIsNewer: true,
      lastTools: [
        {
          name: "Read",
          input: "specs/launch.md",
          description: null,
          warnings: [],
        },
      ],
      messageCount: 6,
    },
    taskSummary: {
      title: "AI risk launch eval harness",
      description: "Build a reviewer-ready harness and decision rubric for launch risk sign-off.",
      source: "prompt",
      ticketId: null,
      ticketUrl: null,
    },
    hasPendingToolUse: false,
    jsonlPath: "/Users/philipjcortes/.claude/projects/-Users-philipjcortes-coo/session-1.jsonl",
    transcriptSource: "hook",
    sessionMinutes: 30,
    ...overrides,
  };
}

describe("coachSession", () => {
  it("produces domain-specific coaching for eval and harness work", () => {
    const coached = coachSession(makeSession());

    expect(coached.workType).toBe("eval_harness");
    expect(coached.rigorSignals).toContain("explicit evaluation criteria");
    expect(coached.worldClassMoves.join(" ")).toContain("harness");
    expect(coached.sophisticationScore).toBeGreaterThan(60);
  });

  it("raises a blocking cue when Claude is waiting on the user", () => {
    const monitor = buildSessionMonitor([makeSession()]);

    expect(monitor.waitingCount).toBe(1);
    expect(monitor.cues[0]?.title).toContain("blocked");
    expect(monitor.note).toContain("live CLI transcripts");
  });
});
