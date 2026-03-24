import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { ClaudeSession } from "./types";
import {
  CooDashboardSummary,
  CooProjectFocus,
  CooProjectFocusView,
  CooReplyType,
  getCooBrief,
  getTopProjectFocus,
} from "./coo-advisor";

const CONFIG_DIR = join(homedir(), ".claude-control");
const STATE_FILE = join(CONFIG_DIR, "coo-state.json");
const HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 48;
const MAX_ACTIONS = 40;

type OperatorActionType = "approve" | "reject" | "reply" | "copy-draft" | "load-draft" | "use-draft" | "focus";

interface ProjectHistoryEntry {
  ts: string;
  rank: number;
  score: number;
  priority: CooProjectFocus["priority"];
  replyType: CooReplyType;
}

interface OperatorActionRecord {
  ts: string;
  actionType: OperatorActionType;
  sessionKey: string | null;
  fingerprint: string | null;
}

interface RecommendationRecord {
  fingerprint: string;
  replyType: CooReplyType;
  sessionKey: string;
  issuedAt: string;
  status: "pending" | "acted" | "resolved";
  aligned: boolean | null;
  evidence: string | null;
  lastActionType: OperatorActionType | null;
  lastActionAt: string | null;
  resolvedAt: string | null;
}

interface ProjectStateRecord {
  repoName: string;
  history: ProjectHistoryEntry[];
  recentActions: OperatorActionRecord[];
  currentRecommendation: RecommendationRecord | null;
}

interface PersistedCooState {
  version: 1;
  projects: Record<string, ProjectStateRecord>;
}

export interface RecordOperatorActionInput {
  repoPath: string;
  repoName?: string | null;
  sessionKey?: string | null;
  fingerprint?: string | null;
  actionType: OperatorActionType;
}

let cachedState: PersistedCooState = { version: 1, projects: {} };
let cachedMtime = 0;

async function loadState(): Promise<PersistedCooState> {
  try {
    const fileStat = await stat(STATE_FILE);
    if (fileStat.mtimeMs === cachedMtime) return cachedState;
    const raw = await readFile(STATE_FILE, "utf-8");
    cachedState = JSON.parse(raw) as PersistedCooState;
    cachedMtime = fileStat.mtimeMs;
    return cachedState;
  } catch {
    return cachedState;
  }
}

async function saveState(state: PersistedCooState): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  cachedState = state;
  const fileStat = await stat(STATE_FILE);
  cachedMtime = fileStat.mtimeMs;
}

function getOrCreateProjectRecord(state: PersistedCooState, repoPath: string, repoName: string): ProjectStateRecord {
  const existing = state.projects[repoPath];
  if (existing) {
    existing.repoName = repoName;
    return existing;
  }

  const created: ProjectStateRecord = {
    repoName,
    history: [],
    recentActions: [],
    currentRecommendation: null,
  };
  state.projects[repoPath] = created;
  return created;
}

function countWaiting(sessions: ClaudeSession[]): number {
  return sessions.filter((session) => session.status === "waiting").length;
}

function countReviewNeeded(sessions: ClaudeSession[]): number {
  return sessions.filter((session) => {
    const dirty = !!session.git && (session.git.changedFiles > 0 || session.git.untrackedFiles > 0);
    return dirty && (session.status === "idle" || session.status === "finished");
  }).length;
}

function countAtRisk(sessions: ClaudeSession[]): number {
  return sessions.filter((session) => getCooBrief(session).priority === "critical").length;
}

function getHistoryDelta(history: ProjectHistoryEntry[], currentRank: number): number | null {
  const previous = history[history.length - 1];
  if (!previous) return null;
  return previous.rank - currentRank;
}

function shouldAppendHistory(
  history: ProjectHistoryEntry[],
  current: { ts: string; rank: number; score: number; priority: CooProjectFocus["priority"]; replyType: CooReplyType },
) {
  const previous = history[history.length - 1];
  if (!previous) return true;
  const previousTs = new Date(previous.ts).getTime();
  const currentTs = new Date(current.ts).getTime();
  if (currentTs - previousTs >= HISTORY_INTERVAL_MS) return true;
  return (
    previous.rank !== current.rank ||
    previous.score !== current.score ||
    previous.priority !== current.priority ||
    previous.replyType !== current.replyType
  );
}

function isActionAligned(replyType: CooReplyType, actionType: OperatorActionType): boolean | null {
  const aligned: Record<CooReplyType, OperatorActionType[]> = {
    approve: ["approve"],
    clarify: ["reply", "copy-draft", "load-draft", "use-draft"],
    verify: ["reply", "copy-draft", "load-draft", "use-draft"],
    ship: ["reply", "copy-draft", "load-draft", "use-draft"],
    checkpoint: ["reply", "copy-draft", "load-draft", "use-draft", "focus"],
  };
  if (actionType === "reject") return false;
  return aligned[replyType].includes(actionType);
}

function getResolutionStatus(
  focus: CooProjectFocus | undefined,
  recommendation: RecommendationRecord,
): { resolved: boolean; evidence: string | null } {
  if (!focus) {
    return {
      resolved: true,
      evidence: "This repo dropped out of the active COO focus stack.",
    };
  }

  switch (recommendation.replyType) {
    case "approve":
      return {
        resolved: !(focus.sessionStatus === "waiting" && focus.hasPendingToolUse),
        evidence: !(focus.sessionStatus === "waiting" && focus.hasPendingToolUse)
          ? "The permission prompt is no longer blocking the session."
          : null,
      };
    case "clarify":
      return {
        resolved: focus.sessionStatus !== "waiting",
        evidence:
          focus.sessionStatus !== "waiting" ? "The blocked question is no longer waiting on operator input." : null,
      };
    case "verify":
      return {
        resolved: !focus.isDirty || focus.dirtyCount === 0 || focus.hasPr,
        evidence:
          !focus.isDirty || focus.dirtyCount === 0
            ? "The repo is no longer sitting on unreviewed local changes."
            : focus.hasPr
              ? "A PR exists now, so verification moved into the review lane."
              : null,
      };
    case "ship":
      return {
        resolved: focus.hasPr || focus.dirtyCount === 0,
        evidence: focus.hasPr
          ? "A PR exists now, so the work moved into the shipping lane."
          : focus.dirtyCount === 0
            ? "The local diff was cleared."
            : null,
      };
    case "checkpoint":
      return {
        resolved: focus.sessionStatus !== "errored" && focus.sessionStatus !== "waiting",
        evidence:
          focus.sessionStatus !== "errored" && focus.sessionStatus !== "waiting"
            ? "The session moved past the checkpoint state."
            : null,
      };
  }
}

export async function recordCooOperatorAction(input: RecordOperatorActionInput): Promise<void> {
  const state = await loadState();
  const project = getOrCreateProjectRecord(
    state,
    input.repoPath,
    input.repoName || input.repoPath.split("/").filter(Boolean).pop() || input.repoPath,
  );
  const now = new Date().toISOString();

  project.recentActions.push({
    ts: now,
    actionType: input.actionType,
    sessionKey: input.sessionKey ?? null,
    fingerprint: input.fingerprint ?? null,
  });
  project.recentActions = project.recentActions.slice(-MAX_ACTIONS);

  const recommendation = project.currentRecommendation;
  if (
    recommendation &&
    (!input.fingerprint ||
      input.fingerprint === recommendation.fingerprint ||
      input.sessionKey === recommendation.sessionKey)
  ) {
    recommendation.status = "acted";
    recommendation.aligned = isActionAligned(recommendation.replyType, input.actionType);
    recommendation.lastActionType = input.actionType;
    recommendation.lastActionAt = now;
    recommendation.evidence =
      recommendation.aligned === false
        ? `Operator chose ${input.actionType} instead of the recommended ${recommendation.replyType} move.`
        : `Operator used ${input.actionType} on this recommendation.`;
  }

  await saveState(state);
}

export async function buildCooDashboardSummary(sessions: ClaudeSession[]): Promise<CooDashboardSummary> {
  const state = await loadState();
  const now = new Date().toISOString();
  const focus = getTopProjectFocus(sessions, 5);
  const focusByRepo = new Map(focus.map((item) => [item.repoPath, item]));
  const result: CooProjectFocusView[] = [];
  let changed = false;

  for (const [repoPath, project] of Object.entries(state.projects)) {
    const recommendation = project.currentRecommendation;
    if (!recommendation || recommendation.status === "resolved") continue;
    const resolution = getResolutionStatus(focusByRepo.get(repoPath), recommendation);
    if (resolution.resolved) {
      recommendation.status = "resolved";
      recommendation.resolvedAt = now;
      recommendation.evidence = resolution.evidence;
      changed = true;
    }
  }

  focus.forEach((item, index) => {
    const rank = index + 1;
    const project = getOrCreateProjectRecord(state, item.repoPath, item.repoName);
    const delta = getHistoryDelta(project.history, rank);

    if (
      shouldAppendHistory(project.history, {
        ts: now,
        rank,
        score: item.score,
        priority: item.priority,
        replyType: item.replyType,
      })
    ) {
      project.history.push({
        ts: now,
        rank,
        score: item.score,
        priority: item.priority,
        replyType: item.replyType,
      });
      project.history = project.history.slice(-MAX_HISTORY);
      changed = true;
    }

    const existing = project.currentRecommendation;
    if (!existing || existing.status === "resolved" || existing.fingerprint !== item.fingerprint) {
      project.currentRecommendation = {
        fingerprint: item.fingerprint,
        replyType: item.replyType,
        sessionKey: item.sessionKey,
        issuedAt: now,
        status: "pending",
        aligned: null,
        evidence: `Recommended next move: ${item.replyType}.`,
        lastActionType: null,
        lastActionAt: null,
        resolvedAt: null,
      };
      changed = true;
    }

    const currentRecommendation = project.currentRecommendation!;
    const latestAction = [...project.recentActions]
      .reverse()
      .find(
        (action) =>
          new Date(action.ts).getTime() >= new Date(currentRecommendation.issuedAt).getTime() &&
          (action.fingerprint === currentRecommendation.fingerprint ||
            action.sessionKey === currentRecommendation.sessionKey),
      );

    if (latestAction && currentRecommendation.status === "pending") {
      currentRecommendation.status = "acted";
      currentRecommendation.aligned = isActionAligned(currentRecommendation.replyType, latestAction.actionType);
      currentRecommendation.lastActionType = latestAction.actionType;
      currentRecommendation.lastActionAt = latestAction.ts;
      currentRecommendation.evidence =
        currentRecommendation.aligned === false
          ? `Operator used ${latestAction.actionType}, which overrides the recommended ${currentRecommendation.replyType} move.`
          : `Operator used ${latestAction.actionType} on this recommendation.`;
      changed = true;
    }

    const resolution = getResolutionStatus(item, currentRecommendation);
    if (resolution.resolved && currentRecommendation.status !== "resolved") {
      currentRecommendation.status = "resolved";
      currentRecommendation.resolvedAt = now;
      currentRecommendation.evidence = resolution.evidence;
      changed = true;
    }

    result.push({
      ...item,
      rank,
      delta,
      compliance: {
        status: currentRecommendation.status,
        aligned: currentRecommendation.aligned,
        evidence: currentRecommendation.evidence,
        lastActionType: currentRecommendation.lastActionType,
        lastActionAt: currentRecommendation.lastActionAt,
      },
    });
  });

  if (changed) {
    await saveState(state);
  }

  return {
    focus: result,
    waitingCount: countWaiting(sessions),
    reviewCount: countReviewNeeded(sessions),
    atRiskCount: countAtRisk(sessions),
    updatedAt: now,
  };
}
