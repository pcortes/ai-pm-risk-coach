import { groupSessions } from "./group-sessions";
import { ClaudeSession } from "./types";

export type CooPriority = "critical" | "high" | "medium" | "low";
export type CooReplyType = "approve" | "clarify" | "verify" | "ship" | "checkpoint";
export type CooComplianceStatus = "pending" | "acted" | "resolved";
export type CooRoadmapLane = "marketing" | "product" | "engineering";

export interface CooRoadmapTrack {
  lane: CooRoadmapLane;
  headline: string;
  actions: string[];
}

export interface SessionCooBrief {
  priority: CooPriority;
  replyType: CooReplyType;
  score: number;
  situation: string;
  headline: string;
  why: string;
  nextActions: string[];
  roadmaps: CooRoadmapTrack[];
  suggestedReply: string | null;
  fingerprint: string;
}

export interface CooProjectFocus {
  repoName: string;
  repoPath: string;
  priority: CooPriority;
  replyType: CooReplyType;
  score: number;
  situation: string;
  headline: string;
  why: string;
  nextActions: string[];
  roadmaps: CooRoadmapTrack[];
  taskTitle: string | null;
  waitingCount: number;
  workingCount: number;
  dirtyCount: number;
  sessionCount: number;
  suggestedReply: string | null;
  sessionKey: string;
  sessionId: string;
  sessionStatus: ClaudeSession["status"];
  hasPendingToolUse: boolean;
  hasPr: boolean;
  isDirty: boolean;
  fingerprint: string;
}

export interface CooCompliance {
  status: CooComplianceStatus;
  aligned: boolean | null;
  evidence: string | null;
  lastActionType: string | null;
  lastActionAt: string | null;
}

export interface CooProjectFocusView extends CooProjectFocus {
  rank: number;
  delta: number | null;
  compliance: CooCompliance;
}

export interface CooDashboardSummary {
  focus: CooProjectFocusView[];
  waitingCount: number;
  reviewCount: number;
  atRiskCount: number;
  updatedAt: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPriorityFromScore(score: number): CooPriority {
  if (score >= 92) return "critical";
  if (score >= 74) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function getTaskTarget(session: ClaudeSession): string {
  const title = session.taskSummary?.title?.trim();
  return title && title.length > 0 ? title : session.repoName || "this project";
}

export function getReplyTypeLabel(replyType: CooReplyType): string {
  const labels: Record<CooReplyType, string> = {
    approve: "Approve unblock",
    clarify: "Clarify boundary",
    verify: "Demand proof",
    ship: "Ship forward",
    checkpoint: "Checkpoint",
  };
  return labels[replyType];
}

function isDirty(session: ClaudeSession): boolean {
  return !!session.git && (session.git.changedFiles > 0 || session.git.untrackedFiles > 0);
}

function getDirtySummary(session: ClaudeSession): string | null {
  if (!session.git) return null;
  const parts: string[] = [];
  if (session.git.changedFiles > 0) {
    parts.push(`${session.git.changedFiles} changed file${session.git.changedFiles === 1 ? "" : "s"}`);
  }
  if (session.git.untrackedFiles > 0) {
    parts.push(`${session.git.untrackedFiles} untracked`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function getRiskyTool(session: ClaudeSession) {
  return session.preview.lastTools.find((tool) => tool.warnings.length > 0) ?? null;
}

function looksLikeDecisionPrompt(text: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("?") ||
    /should i|would you like|want me to|which option|can you confirm|how would you like|before i|do you want/i.test(
      lower,
    )
  );
}

function getDiffRiskBonus(session: ClaudeSession): number {
  if (!session.git) return 0;
  const churn = session.git.additions + session.git.deletions;
  let bonus = 0;
  bonus += Math.min(session.git.changedFiles, 10);
  if (session.git.untrackedFiles > 0) bonus += 3;
  if (churn >= 400) bonus += 6;
  return bonus;
}

function getBriefFingerprint(session: ClaudeSession, replyType: CooReplyType, headline: string): string {
  const task = session.taskSummary?.title?.trim() || session.repoName || "repo";
  const dirty = session.git ? `${session.git.changedFiles}:${session.git.untrackedFiles}` : "clean";
  return [
    session.parentRepo || session.workingDirectory,
    session.status,
    replyType,
    task,
    headline,
    dirty,
    session.prUrl ? "pr" : "no-pr",
  ].join("|");
}

interface BriefContext {
  taskTarget: string;
  dirty: boolean;
  dirtySummary: string | null;
  riskyTool: ReturnType<typeof getRiskyTool>;
  decisionPrompt: boolean;
}

function buildMarketingRoadmap(session: ClaudeSession, context: BriefContext): CooRoadmapTrack {
  if (session.status === "errored") {
    return {
      lane: "marketing",
      headline: "Recovery proof",
      actions: [
        `Write the one-sentence promise ${context.taskTarget} is supposed to restore.`,
        "Capture a before and after artifact the moment the fix verifies.",
      ],
    };
  }

  if (session.status === "waiting" && session.hasPendingToolUse) {
    return {
      lane: "marketing",
      headline: "Proof behind the step",
      actions: [
        `State what user-visible outcome this command should unlock for ${context.taskTarget}.`,
        "List the proof artifact you expect afterward: screenshot, clip, benchmark, or walkthrough.",
      ],
    };
  }

  if (session.status === "waiting") {
    return {
      lane: "marketing",
      headline: "Position the wedge",
      actions: [
        `Define who benefits first from ${context.taskTarget} and why now.`,
        "Write the one-line message this pass should be able to support afterward.",
      ],
    };
  }

  if (session.prUrl || ((session.status === "finished" || session.status === "idle") && context.dirty)) {
    return {
      lane: "marketing",
      headline: "Launch proof pack",
      actions: [
        `Draft the release-note headline for ${context.taskTarget}.`,
        "Capture one before and after demo artifact plus three proof points.",
      ],
    };
  }

  if (session.status === "working") {
    return {
      lane: "marketing",
      headline: "Narrative capture",
      actions: [
        `Keep one demo-worthy artifact in flight while ${context.taskTarget} is being built.`,
        "Write the differentiator claim this branch is trying to earn.",
      ],
    };
  }

  return {
    lane: "marketing",
    headline: "Market framing",
    actions: [
      `Define audience, pain, and promise for ${context.taskTarget}.`,
      "List the next proof asset this repo needs before anyone sells the story.",
    ],
  };
}

function buildProductRoadmap(session: ClaudeSession, context: BriefContext): CooRoadmapTrack {
  if (session.status === "errored") {
    return {
      lane: "product",
      headline: "Protect the core path",
      actions: [
        `Name the exact user flow ${context.taskTarget} is failing to support.`,
        "Set the acceptance bar for the fix before adding anything else.",
      ],
    };
  }

  if (session.status === "waiting" && session.hasPendingToolUse) {
    return {
      lane: "product",
      headline: "Boundary before execution",
      actions: [
        `State the exact outcome this command is allowed to unlock for ${context.taskTarget}.`,
        "Name what is explicitly out of scope for this pass.",
      ],
    };
  }

  if (session.status === "waiting") {
    return {
      lane: "product",
      headline: "Choose the wedge",
      actions: [
        `Pick the smallest user-visible outcome for ${context.taskTarget}.`,
        "Write acceptance criteria plus what will wait until the next round.",
      ],
    };
  }

  if (session.prUrl) {
    return {
      lane: "product",
      headline: "Review readiness",
      actions: [
        "Write the acceptance checklist reviewers should validate.",
        "List follow-on product questions that belong in the next issue, not this PR.",
      ],
    };
  }

  if ((session.status === "finished" || session.status === "idle") && context.dirty) {
    return {
      lane: "product",
      headline: "Turn code into milestone",
      actions: [
        "Confirm the changed path still maps to one clear user outcome.",
        "Document the next product iteration after this wedge ships.",
      ],
    };
  }

  if (session.status === "working") {
    return {
      lane: "product",
      headline: "Scope coherence",
      actions: [
        "Check that every changed file still supports the same user-facing wedge.",
        "Move follow-on ideas into notes instead of widening this branch.",
      ],
    };
  }

  return {
    lane: "product",
    headline: "Milestone definition",
    actions: [
      `Define the next user-visible milestone for ${context.taskTarget}.`,
      "Write the success signal that will tell you the milestone actually landed.",
    ],
  };
}

function buildEngineeringRoadmap(session: ClaudeSession, context: BriefContext): CooRoadmapTrack {
  if (session.status === "errored") {
    return {
      lane: "engineering",
      headline: "Stability lane",
      actions: [
        "Reduce the failure to one root cause and fix the narrowest thing first.",
        "Run the smallest verification that proves the branch is stable again.",
      ],
    };
  }

  if (session.status === "waiting" && session.hasPendingToolUse) {
    return {
      lane: "engineering",
      headline: context.riskyTool ? "Safe execution approval" : "Execution unblock",
      actions: context.riskyTool
        ? [
            "Make the agent narrow the exact files, paths, and command variant first.",
            "Approve the command only after the blast radius is explicit.",
          ]
        : [
            "Approve the narrow command that directly advances the task.",
            "Ask for a quick proof summary immediately after it runs.",
          ],
    };
  }

  if (session.status === "waiting") {
    return {
      lane: "engineering",
      headline: "Build after decision",
      actions: [
        "Implement the narrow wedge only, then run the fastest relevant check.",
        "Return with touched files, pass or fail, and remaining technical risk.",
      ],
    };
  }

  if (session.prUrl) {
    return {
      lane: "engineering",
      headline: "Review and CI lane",
      actions: [
        "Clear CI or review blockers before reopening implementation.",
        "If code changes are needed, patch only what the PR feedback requires.",
      ],
    };
  }

  if ((session.status === "finished" || session.status === "idle") && context.dirty) {
    return {
      lane: "engineering",
      headline: "Verify and ship",
      actions: [
        `Run the narrowest verification for the current diff${context.dirtySummary ? ` (${context.dirtySummary})` : ""}.`,
        "Then commit, open the PR, and summarize residual risk in one pass.",
      ],
    };
  }

  if (session.status === "working") {
    return {
      lane: "engineering",
      headline: "Delivery lane",
      actions: [
        "Finish the current wedge before paying refactor or architecture tax.",
        "Checkpoint with proof and residual risk before any expansion.",
      ],
    };
  }

  return {
    lane: "engineering",
    headline: "Build readiness",
    actions: [
      "Keep the fastest verification path ready for the next change set.",
      "Prepare the smallest technical slice that can earn a user-visible win.",
    ],
  };
}

function buildRoadmaps(session: ClaudeSession, context: BriefContext): CooRoadmapTrack[] {
  return [
    buildMarketingRoadmap(session, context),
    buildProductRoadmap(session, context),
    buildEngineeringRoadmap(session, context),
  ];
}

export function getCooBrief(session: ClaudeSession): SessionCooBrief {
  const taskTarget = getTaskTarget(session);
  const dirtySummary = getDirtySummary(session);
  const riskyTool = getRiskyTool(session);
  const dirty = isDirty(session);
  const decisionPrompt = looksLikeDecisionPrompt(session.preview.lastAssistantText);

  let score = 20;
  let replyType: CooReplyType = "checkpoint";
  let situation = "Stable lane";
  let headline = "Keep the project framed so the next move is fast when you re-enter";
  let why =
    "Governing constraint: this repo is not on fire, which means the useful work is preparing the next wedge, proof path, and narrative instead of generating more random motion.";
  let nextActions = [
    "Define the next milestone in one sentence.",
    "Keep the proof path and message for that milestone ready.",
  ];
  let suggestedReply: string | null = null;

  if (session.status === "errored") {
    score = 94;
    replyType = "checkpoint";
    situation = "Execution blocked";
    headline = "Collapse the failure to one root cause before this branch earns another round of work";
    why =
      "Governing constraint: this branch is compounding uncertainty, not value. Morrison would not widen a broken loop, Vasquez would force a clean blocker summary, and Okonkwo would treat any extra scope here as pure distraction.";
    nextActions = [
      "Make the agent name the exact failing command, file, or test in plain English.",
      "Fix the smallest root cause instead of redesigning the surrounding system.",
      "Demand the narrowest verification that proves the branch is stable again.",
    ];
    suggestedReply =
      "Summarize the exact failure in two bullets, fix the smallest root cause, run the narrowest relevant verification, and then tell me what still looks risky.";
  } else if (session.status === "waiting" && session.hasPendingToolUse) {
    score = riskyTool ? 96 : 88;
    replyType = riskyTool ? "clarify" : "approve";
    situation = riskyTool ? "Approval request with blast radius" : "Safe unblock waiting on operator";
    headline = riskyTool
      ? "Do not grant power until the agent narrows the command to the exact blast radius"
      : "Approve the narrow unblock and keep the branch moving";
    why = riskyTool
      ? "Governing constraint: operator trust is scarcer than cycle time on this branch. Morrison would force specificity before touching the system, Vasquez would spend one clarification now to avoid cleanup later, and Okonkwo would not trade safety for tempo."
      : "Governing constraint: the command appears reversible and scoped, so operator latency is now the drag. Chen would unblock the work, and Vasquez would avoid turning a safe approval into dead time.";
    nextActions = riskyTool
      ? [
          "Make the agent specify the exact files, paths, and command variant it will use.",
          "Reject any restatement that stays broad, forceful, or weakly justified.",
          "Approve only the narrowed version that directly advances this task.",
        ]
      : [
          "Approve if the scope is narrow and the repo context is clearly correct.",
          "Reject if the path or command reaches beyond the stated task.",
          "If anything is ambiguous, force a one-line justification first.",
        ];
    suggestedReply = riskyTool
      ? "Before running that, explain the exact files or paths you will touch, why this command is necessary, and the safest narrower version you can use instead."
      : null;
  } else if (session.status === "waiting") {
    score = 82;
    replyType = decisionPrompt ? "clarify" : "checkpoint";
    situation = decisionPrompt ? "Branch paused on product decision" : "Branch paused on operator direction";
    headline = "Make the call, define the boundary, and restart execution";
    why = decisionPrompt
      ? "Governing constraint: engineering is waiting on an unmade decision, not on more engineering. Chen would force the smallest user-visible win, Williams would keep the UX wedge tight, and Vasquez would treat unanswered questions as inventory."
      : "Governing constraint: the session is paused because the operator has not chosen the wedge. The right move is to set the boundary clearly enough that Claude can execute without reopening strategy every turn.";
    nextActions = [
      "Choose the smallest shippable outcome instead of the most complete answer.",
      "State what is explicitly out of scope for this pass.",
      "Require focused verification immediately after the change.",
    ];
    suggestedReply = `Take the smallest shippable path for ${taskTarget}. Keep scope tight, make the change, run the narrowest relevant verification, and then summarize what changed plus any remaining risk.`;
  } else if ((session.status === "finished" || session.status === "idle") && dirty) {
    score = session.status === "finished" ? 76 : 70;
    replyType = session.status === "finished" ? "ship" : "verify";
    situation = session.status === "finished" ? "Ready to ship, not yet converted" : "Unverified local work";
    headline =
      session.status === "finished"
        ? "Convert finished work into a reviewed artifact before starting anything new"
        : "Stop discussing the diff and prove or kill it";
    why =
      session.status === "finished"
        ? "Governing constraint: local completion is still inventory. Okonkwo cares about turning work into a reviewable artifact, Vasquez treats parked finished work as execution drag, and Morrison wants one proof pass before landing."
        : "Governing constraint: unverified changes are consuming attention without earning confidence. Morrison would demand proof, Chen would tie the branch back to user value, and Vasquez would not let this sit in limbo.";
    nextActions = [
      "Review the scope once and cut anything that does not belong to the wedge.",
      "Run the narrowest verification that proves the changed path is sound.",
      session.prUrl
        ? "Work the PR queue after proof instead of reopening implementation."
        : "Then commit, open a PR, or request one final polish pass.",
    ];
    suggestedReply =
      "Run the narrowest relevant verification for the current changes, then give me a concise ship report: touched files, pass or fail, remaining risks, and the exact commit message you recommend.";
  } else if (session.prUrl) {
    score = 52;
    replyType = "verify";
    situation = "PR in review lane";
    headline = "Spend operating energy on review throughput, not more implementation";
    why =
      "Governing constraint: once a PR exists, review and CI are the limiting functions. Vasquez would clear blockers in the lane, and Morrison would not reopen coding without a concrete review-driven reason.";
    nextActions = [
      "Check CI and reviewer state before asking for another code pass.",
      "Only reopen implementation if the PR has a concrete blocker.",
      "If needed, ask the agent for a blocker summary instead of a new feature loop.",
    ];
  } else if (session.status === "working") {
    score = 44;
    replyType = "checkpoint";
    situation = dirty ? "Active branch with surface area growing" : "Active execution lane";
    headline = "Keep the branch on the current wedge and force a checkpoint before any expansion";
    why = dirty
      ? "Governing constraint: the branch only earns more scope after it proves the current wedge. Chen would finish the user-visible win first, Morrison would defer refactor tax, and Vasquez would intervene only if execution drifts."
      : "Governing constraint: the strategic mistake here is interrupting momentum without a stronger priority. Let the branch finish its present bet, then decide whether it earned another round.";
    nextActions = [
      "Do not interrupt unless a more important repo genuinely displaced it.",
      "If the branch starts widening, force a checkpoint summary and boundary reset.",
      "Bias the next exchange toward proof and completion, not expansion.",
    ];
  }

  score += getDiffRiskBonus(session);
  if (riskyTool) score += 3;
  if (session.isWorktree && (session.status === "idle" || session.status === "finished")) score += 3;
  score = clamp(score, 10, 99);

  const roadmaps = buildRoadmaps(session, {
    taskTarget,
    dirty,
    dirtySummary,
    riskyTool,
    decisionPrompt,
  });

  return {
    priority: getPriorityFromScore(score),
    replyType,
    score,
    situation,
    headline,
    why,
    nextActions: nextActions.slice(0, 3),
    roadmaps,
    suggestedReply,
    fingerprint: getBriefFingerprint(session, replyType, headline),
  };
}

export function getTopProjectFocus(sessions: ClaudeSession[], limit = 3): CooProjectFocus[] {
  return groupSessions(sessions)
    .map((group) => {
      const sessionBriefs = group.sessions.map((session) => ({
        session,
        brief: getCooBrief(session),
        sessionKey: session.id,
      }));
      sessionBriefs.sort(
        (a, b) => b.brief.score - a.brief.score || a.session.workingDirectory.localeCompare(b.session.workingDirectory),
      );

      const primary = sessionBriefs[0];
      const waitingCount = group.sessions.filter((session) => session.status === "waiting").length;
      const workingCount = group.sessions.filter((session) => session.status === "working").length;
      const dirtyCount = group.sessions.filter((session) => isDirty(session)).length;
      const boostedScore = clamp(
        primary.brief.score + Math.min((waitingCount - 1) * 3, 6) + Math.min(dirtyCount, 4),
        10,
        99,
      );

      return {
        repoName: group.repoName,
        repoPath: group.repoPath,
        priority: getPriorityFromScore(boostedScore),
        replyType: primary.brief.replyType,
        score: boostedScore,
        situation: primary.brief.situation,
        headline: primary.brief.headline,
        why: primary.brief.why,
        nextActions: primary.brief.nextActions,
        roadmaps: primary.brief.roadmaps,
        taskTitle: primary.session.taskSummary?.title ?? null,
        waitingCount,
        workingCount,
        dirtyCount,
        sessionCount: group.sessions.length,
        suggestedReply: primary.brief.suggestedReply,
        sessionKey: primary.sessionKey,
        sessionId: primary.session.id,
        sessionStatus: primary.session.status,
        hasPendingToolUse: primary.session.hasPendingToolUse,
        hasPr: !!primary.session.prUrl,
        isDirty: isDirty(primary.session),
        fingerprint: getBriefFingerprint(primary.session, primary.brief.replyType, primary.brief.headline),
      } satisfies CooProjectFocus;
    })
    .sort((a, b) => b.score - a.score || a.repoName.localeCompare(b.repoName))
    .slice(0, limit);
}
