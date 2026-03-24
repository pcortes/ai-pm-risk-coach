import type { ClaudeSession } from "../monitor/types";
import { appendUsageEntry, readTrackedClaudeSessionState, readUsageEntries, writeTrackedClaudeSessionState } from "./storage";
import type { CoachUsageEntry, CoachedSession, TrackedClaudeSessionState } from "./types";
import { coachSession } from "./session-intelligence";

const SESSION_MIN_DURATION_MS = 45 * 1000;

export async function syncClaudeSessionCapture(sessions: ClaudeSession[], now = new Date()) {
  const nowIso = now.toISOString();
  const existingState = await readTrackedClaudeSessionState();
  const usageEntries = await readUsageEntries();
  const nextState: Record<string, TrackedClaudeSessionState> = {};
  const coachedSessions: CoachedSession[] = [];
  const observedIds = new Set<string>();

  for (const session of sessions) {
    observedIds.add(session.id);
    const previous = existingState[session.id];
    const trackedStartAt = previous?.startedAt ?? nowIso;
    const trackedMinutes = computeTrackedMinutes(trackedStartAt, nowIso);
    const coachedSession = coachSession({
      ...session,
      sessionMinutes: trackedMinutes,
    });
    coachedSessions.push(coachedSession);

    nextState[session.id] = {
      trackingVersion: 2,
      id: session.id,
      startedAt: trackedStartAt,
      lastSeenAt: nowIso,
      endedAt: null,
      repoName: coachedSession.repoName,
      workingDirectory: coachedSession.workingDirectory,
      branch: coachedSession.branch,
      taskTitle: coachedSession.taskTitle,
      taskDescription: coachedSession.taskDescription,
      lastUserMessage: coachedSession.previewUser,
      lastAssistantText: coachedSession.previewAssistant,
      lastToolNames: coachedSession.lastToolNames,
      workType: coachedSession.workType,
      rigorSignals: coachedSession.rigorSignals,
      weaknessSignals: coachedSession.weaknessSignals,
      status: coachedSession.status,
    };
  }

  for (const [sessionId, state] of Object.entries(existingState)) {
    if (observedIds.has(sessionId)) continue;
    const finalizedEntry = finalizeTrackedSession(state, usageEntries, nowIso);
    if (finalizedEntry) {
      usageEntries.push(finalizedEntry);
      await appendUsageEntry(finalizedEntry);
    }
  }

  await writeTrackedClaudeSessionState(nextState);

  return {
    activeSessions: coachedSessions,
    liveEntries: coachedSessions.map((session) => buildLiveUsageEntry(session, nowIso)),
  };
}

function finalizeTrackedSession(
  state: TrackedClaudeSessionState,
  existingEntries: CoachUsageEntry[],
  endedAt: string,
): CoachUsageEntry | null {
  const durationMs = Date.parse(endedAt) - Date.parse(state.startedAt);
  if (Number.isNaN(durationMs) || durationMs < SESSION_MIN_DURATION_MS) {
    return null;
  }

  if (existingEntries.some((entry) => entry.sessionId === state.id && entry.sessionEndedAt === endedAt)) {
    return null;
  }

  return buildUsageEntryFromState(state, endedAt);
}

function buildLiveUsageEntry(session: CoachedSession, nowIso: string): CoachUsageEntry {
  return {
    timestamp: nowIso,
    tool: "claude-code",
    prompt: session.taskTitle ?? session.previewUser ?? "Active Claude Code session",
    minutes: session.sessionMinutes,
    tags: buildTags(session),
    notes: buildNotes({
      repoName: session.repoName,
      branch: session.branch,
      taskTitle: session.taskTitle,
      lastAssistantText: session.previewAssistant,
      lastToolNames: session.lastToolNames,
      status: session.status,
    }),
    contextAppName: "Claude Code",
    contextWindowTitle: session.taskTitle ?? session.repoName,
    contextWorkMode: session.workType,
    source: "auto",
    promptCaptureMode: "session_preview",
    sessionId: session.id,
    sessionProvider: "claude",
    sessionStartedAt: session.startedAt,
    sessionEndedAt: null,
  };
}

function buildUsageEntryFromState(state: TrackedClaudeSessionState, endedAt: string): CoachUsageEntry {
  return {
    timestamp: endedAt,
    tool: "claude-code",
    prompt: state.taskTitle ?? state.lastUserMessage ?? "Claude Code session",
    minutes: Math.max(1, Math.round((Date.parse(endedAt) - Date.parse(state.startedAt)) / 60000)),
    tags: buildTags(state),
    notes: buildNotes(state),
    contextAppName: "Claude Code",
    contextWindowTitle: state.taskTitle ?? state.repoName,
    contextWorkMode: state.workType,
    source: "auto",
    promptCaptureMode: "session_preview",
    sessionId: state.id,
    sessionProvider: "claude",
    sessionStartedAt: state.startedAt,
    sessionEndedAt: endedAt,
  };
}

function computeTrackedMinutes(startedAt: string, nowIso: string) {
  const durationMs = Date.parse(nowIso) - Date.parse(startedAt);
  if (Number.isNaN(durationMs) || durationMs <= 0) return 0;
  return Math.max(1, Math.round(durationMs / 60000));
}

function buildTags(input: {
  workType: string;
  repoName: string | null;
  rigorSignals?: string[];
  weaknessSignals?: string[];
}) {
  const tags = ["auto-captured", "claude-code", input.workType];
  if (input.repoName) tags.push(input.repoName.toLowerCase());
  tags.push(...(input.rigorSignals ?? []).slice(0, 2));
  tags.push(...(input.weaknessSignals ?? []).slice(0, 1));
  return Array.from(new Set(tags.filter(Boolean)));
}

function buildNotes(input: {
  repoName: string | null;
  branch: string | null;
  taskTitle: string | null;
  lastAssistantText: string | null;
  lastToolNames: string[];
  status: string;
}) {
  const parts = [
    input.repoName ? `Repo: ${input.repoName}` : null,
    input.branch ? `Branch: ${input.branch}` : null,
    input.taskTitle ? `Task: ${input.taskTitle}` : null,
    input.lastAssistantText ? `Latest assistant turn: ${input.lastAssistantText}` : null,
    input.lastToolNames.length > 0 ? `Tools: ${input.lastToolNames.join(", ")}` : null,
    `Status: ${input.status}`,
  ];
  return parts.filter(Boolean).join(" · ");
}
