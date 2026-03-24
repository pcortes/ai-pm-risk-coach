import { ActiveContext, AutoCaptureStatus, AutoUsageSession, CoachUsageEntry, PromptCaptureMode } from "./types";
import { appendUsageEntry, clearAutoUsageSession, readAutoUsageSession, readUsageEntries, writeAutoUsageSession } from "./storage";

const AUTO_IDLE_FLUSH_MS = 90 * 1000;
const AUTO_MIN_SESSION_MS = 45 * 1000;

const AI_TOOL_PATTERNS: Array<{ tool: string; labels: string[] }> = [
  { tool: "chatgpt", labels: ["chatgpt", "openai"] },
  { tool: "claude", labels: ["claude", "anthropic"] },
  { tool: "gemini", labels: ["gemini", "bard"] },
  { tool: "meta-ai", labels: ["meta ai", "meta.ai"] },
  { tool: "perplexity", labels: ["perplexity"] },
  { tool: "grok", labels: ["grok"] },
  { tool: "cursor", labels: ["cursor"] },
  { tool: "copilot", labels: ["copilot"] },
];

export async function syncAutomaticUsageCapture(activeContext: ActiveContext, now = new Date()): Promise<AutoCaptureStatus> {
  const nowIso = now.toISOString();
  let session = await readAutoUsageSession();
  const detection = detectAutomaticAiContext(activeContext);

  if (session && isStale(session, now)) {
    await finalizeAutoSession(session, nowIso);
    session = null;
  }

  if (!detection) {
    if (session) {
      await finalizeAutoSession(session, nowIso);
      session = null;
    }
    return buildAutoCaptureStatus(null, null);
  }

  if (session && isSameSession(session, detection.tool)) {
    const updated: AutoUsageSession = {
      ...session,
      lastSeenAt: nowIso,
      appName: activeContext.appName,
      windowTitle: activeContext.windowTitle,
      workMode: activeContext.workMode,
      promptCaptureMode: detection.promptCaptureMode,
    };
    await writeAutoUsageSession(updated);
    return buildAutoCaptureStatus(updated, detection.tool);
  }

  if (session) {
    await finalizeAutoSession(session, nowIso);
  }

  const nextSession: AutoUsageSession = {
    startedAt: nowIso,
    lastSeenAt: nowIso,
    tool: detection.tool,
    appName: activeContext.appName,
    windowTitle: activeContext.windowTitle,
    workMode: activeContext.workMode,
    promptCaptureMode: detection.promptCaptureMode,
  };
  await writeAutoUsageSession(nextSession);
  return buildAutoCaptureStatus(nextSession, detection.tool);
}

export function detectAutomaticAiContext(activeContext: ActiveContext): { tool: string; promptCaptureMode: PromptCaptureMode } | null {
  const haystack = `${activeContext.appName ?? ""} ${activeContext.windowTitle ?? ""}`.toLowerCase();
  for (const pattern of AI_TOOL_PATTERNS) {
    if (pattern.labels.some((label) => haystack.includes(label))) {
      return {
        tool: pattern.tool,
        promptCaptureMode: hasMeaningfulWindowTitle(activeContext.windowTitle, pattern.labels)
          ? "window_title"
          : "context_only",
      };
    }
  }
  return null;
}

function buildAutoCaptureStatus(session: AutoUsageSession | null, detectedTool: string | null): AutoCaptureStatus {
  const currentSessionMinutes =
    session ? Math.max(1, Math.round((Date.parse(session.lastSeenAt) - Date.parse(session.startedAt)) / 60000)) : 0;

  return {
    enabled: true,
    detectedTool,
    currentSessionMinutes,
    promptCaptureMode: session?.promptCaptureMode ?? null,
    lastAutoEntryAt: null,
    note: session
      ? `Tracking ${session.tool} automatically from ${session.promptCaptureMode === "window_title" ? "window title" : "context only"}.`
      : "Auto-capture is on. Open ChatGPT, Claude, Gemini, Meta AI, Perplexity, Grok, Cursor, or Copilot and the app will track time automatically.",
  };
}

async function finalizeAutoSession(session: AutoUsageSession, endAt: string) {
  const durationMs = Date.parse(endAt) - Date.parse(session.startedAt);
  await clearAutoUsageSession();

  if (durationMs < AUTO_MIN_SESSION_MS) {
    return null;
  }

  const entry: CoachUsageEntry = {
    timestamp: endAt,
    sessionStartedAt: session.startedAt,
    sessionEndedAt: endAt,
    tool: session.tool,
    prompt: buildAutoPromptSummary(session),
    minutes: Math.max(1, Math.round(durationMs / 60000)),
    tags: ["auto-captured", session.workMode, session.tool].filter(Boolean),
    notes: buildAutoNotes(session),
    outcome: null,
    response: null,
    contextAppName: session.appName,
    contextWindowTitle: session.windowTitle,
    contextWorkMode: session.workMode,
    source: "auto",
    promptCaptureMode: session.promptCaptureMode,
  };

  const entries = await readUsageEntries();
  if (isDuplicateAutoEntry(entries[entries.length - 1], entry)) {
    return null;
  }

  await appendUsageEntry(entry);
  return entry;
}

function buildAutoPromptSummary(session: AutoUsageSession) {
  if (session.promptCaptureMode === "window_title" && hasMeaningfulWindowTitle(session.windowTitle, [session.tool])) {
    return session.windowTitle?.trim() ?? `Auto-captured ${session.tool} session`;
  }
  return `Auto-captured ${session.tool} session during ${session.workMode} work`;
}

function buildAutoNotes(session: AutoUsageSession) {
  const appLabel = session.appName ?? "unknown app";
  const title = session.windowTitle ? `Front window: ${session.windowTitle}` : "No window title captured";
  return `Automatically tracked from ${appLabel}. ${title}`;
}

function hasMeaningfulWindowTitle(windowTitle: string | null, labels: string[]) {
  const title = windowTitle?.trim().toLowerCase();
  if (!title || title.length < 12) return false;
  if (title === "new chat") return false;
  return !labels.some((label) => title === label || title === `${label} - ${label}`);
}

function isSameSession(session: AutoUsageSession, tool: string) {
  return session.tool === tool;
}

function isStale(session: AutoUsageSession, now: Date) {
  return Date.parse(now.toISOString()) - Date.parse(session.lastSeenAt) > AUTO_IDLE_FLUSH_MS;
}

function isDuplicateAutoEntry(previous: CoachUsageEntry | undefined, next: CoachUsageEntry) {
  if (!previous || previous.source !== "auto" || next.source !== "auto") return false;
  return (
    previous.tool === next.tool &&
    previous.sessionStartedAt === next.sessionStartedAt &&
    previous.sessionEndedAt === next.sessionEndedAt
  );
}
