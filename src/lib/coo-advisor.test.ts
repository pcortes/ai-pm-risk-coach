import { describe, expect, it } from "vitest";
import { getCooBrief, getTopProjectFocus } from "./coo-advisor";
import { CLAUDE_SESSION_CAPABILITIES, ClaudeSession } from "./types";

function makeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: "sess-1",
    provider: "claude",
    providerSessionId: "sess-1",
    providerSource: "cli",
    capabilities: CLAUDE_SESSION_CAPABILITIES,
    pid: 1234,
    workingDirectory: "/Users/alli/project",
    repoName: "project",
    parentRepo: null,
    isWorktree: false,
    branch: "feature/test",
    status: "idle",
    lastActivity: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01T00:00:00Z",
    git: null,
    preview: {
      lastUserMessage: null,
      lastAssistantText: null,
      assistantIsNewer: false,
      lastTools: [],
      messageCount: 0,
    },
    hasPendingToolUse: false,
    taskSummary: null,
    jsonlPath: null,
    prUrl: null,
    model: null,
    reasoningEffort: null,
    ...overrides,
  };
}

describe("getCooBrief", () => {
  it("marks risky permission prompts as critical and drafts a safer reply", () => {
    const brief = getCooBrief(
      makeSession({
        status: "waiting",
        hasPendingToolUse: true,
        preview: {
          lastUserMessage: "clean up the build output",
          lastAssistantText: "I need approval for a command.",
          assistantIsNewer: true,
          messageCount: 2,
          lastTools: [
            {
              name: "Bash",
              input: "sudo rm -rf /tmp/build",
              description: "Clean temporary build output",
              warnings: ["Runs with elevated privileges", "Recursive or forced file deletion"],
            },
          ],
        },
      }),
    );

    expect(brief.priority).toBe("critical");
    expect(brief.replyType).toBe("clarify");
    expect(brief.situation).toContain("blast radius");
    expect(brief.roadmaps.map((track) => track.lane)).toEqual(["marketing", "product", "engineering"]);
    expect(brief.suggestedReply).toContain("safest narrower version");
  });

  it("suggests a decisive reply when Claude is waiting on operator input", () => {
    const brief = getCooBrief(
      makeSession({
        status: "waiting",
        preview: {
          lastUserMessage: "finish the bug fix",
          lastAssistantText: "Should I also refactor the shared helper while I am here?",
          assistantIsNewer: true,
          messageCount: 2,
          lastTools: [],
        },
        taskSummary: {
          title: "Finish onboarding bug fix",
          description: null,
          source: "user",
          ticketId: null,
          ticketUrl: null,
        },
      }),
    );

    expect(brief.priority).toBe("high");
    expect(brief.replyType).toBe("clarify");
    expect(brief.roadmaps[1]?.headline).toContain("Choose the wedge");
    expect(brief.suggestedReply).toContain("smallest shippable path");
    expect(brief.suggestedReply).toContain("Finish onboarding bug fix");
  });

  it("prioritizes landing finished work when local changes remain", () => {
    const brief = getCooBrief(
      makeSession({
        status: "finished",
        git: {
          branch: "feature/ship",
          changedFiles: 4,
          additions: 120,
          deletions: 30,
          untrackedFiles: 1,
          shortStat: "4 files changed, 120 insertions(+), 30 deletions(-)",
        },
      }),
    );

    expect(brief.priority).toBe("high");
    expect(brief.replyType).toBe("ship");
    expect(brief.situation).toContain("Ready to ship");
    expect(brief.roadmaps[0]?.headline).toContain("Launch proof pack");
    expect(brief.nextActions[1]).toContain("verification");
  });
});

describe("getTopProjectFocus", () => {
  it("ranks projects by the most urgent session in the group", () => {
    const focus = getTopProjectFocus([
      makeSession({
        id: "safe-idle",
        workingDirectory: "/Users/alli/steady-repo",
        repoName: "steady-repo",
      }),
      makeSession({
        id: "risky-waiting",
        workingDirectory: "/Users/alli/fire-repo",
        repoName: "fire-repo",
        status: "waiting",
        hasPendingToolUse: true,
        preview: {
          lastUserMessage: null,
          lastAssistantText: "Need approval",
          assistantIsNewer: true,
          messageCount: 1,
          lastTools: [
            {
              name: "Bash",
              input: "sudo rm -rf /",
              description: "Danger",
              warnings: ["Runs with elevated privileges"],
            },
          ],
        },
      }),
    ]);

    expect(focus[0].repoName).toBe("fire-repo");
    expect(focus[0].priority).toBe("critical");
  });

  it("groups worktree sessions under the parent repo for project focus", () => {
    const focus = getTopProjectFocus([
      makeSession({
        id: "worktree-1",
        workingDirectory: "/tmp/project-wt-1",
        parentRepo: "/Users/alli/project",
        isWorktree: true,
        repoName: "project-wt-1",
        status: "finished",
        git: {
          branch: "feature/a",
          changedFiles: 2,
          additions: 20,
          deletions: 5,
          untrackedFiles: 0,
          shortStat: "2 files changed, 20 insertions(+), 5 deletions(-)",
        },
      }),
      makeSession({
        id: "worktree-2",
        workingDirectory: "/tmp/project-wt-2",
        parentRepo: "/Users/alli/project",
        isWorktree: true,
        repoName: "project-wt-2",
      }),
    ]);

    expect(focus).toHaveLength(1);
    expect(focus[0].repoPath).toBe("/Users/alli/project");
    expect(focus[0].sessionCount).toBe(2);
  });
});
