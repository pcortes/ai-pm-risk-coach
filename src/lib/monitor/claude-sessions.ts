import { readdir, stat } from "fs/promises";
import { join } from "path";
import { readAllHookStatuses, type HookStatus } from "./hooks-reader";
import { workingDirToProjectDir, repoNameFromPath } from "./paths";
import { getAllProcessInfos, type ProcessInfo } from "./process-utils";
import { buildProcessTree, findClaudePidsFromTree } from "./process-tree";
import {
  extractBranch,
  extractPreview,
  extractSessionId,
  extractStartedAt,
  extractTaskSummary,
  getJsonlMtime,
  hasPendingToolUse,
  isAskingForInput,
  lastMessageHasError,
  readJsonlHead,
  readJsonlTail,
} from "./session-reader";
import { classifyStatus } from "./status-classifier";
import type { ClaudeSession, ConversationPreview } from "./types";

async function findLatestJsonl(projectDir: string, excludePaths?: Set<string>): Promise<string | null> {
  try {
    const entries = await readdir(projectDir);
    const jsonlFiles = entries.filter((entry) => entry.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) return null;

    let latest: { path: string; mtimeMs: number } | null = null;
    for (const file of jsonlFiles) {
      const fullPath = join(projectDir, file);
      if (excludePaths?.has(fullPath)) continue;
      try {
        const stats = await stat(fullPath);
        if (!latest || stats.mtimeMs > latest.mtimeMs) {
          latest = { path: fullPath, mtimeMs: stats.mtimeMs };
        }
      } catch {
        continue;
      }
    }

    return latest?.path ?? null;
  } catch {
    return null;
  }
}

async function buildSession(
  info: ProcessInfo,
  hookStatus: HookStatus | undefined,
  claimedPaths: Set<string>,
  now: Date,
): Promise<ClaudeSession | null> {
  if (!info.workingDirectory) return null;

  const projectDir = workingDirToProjectDir(info.workingDirectory);
  const jsonlPath = hookStatus?.transcriptPath ?? (await findLatestJsonl(projectDir, claimedPaths));

  let sessionId = `pid-${info.pid}`;
  let startedAt: string | null = null;
  let branch: string | null = null;
  let preview: ConversationPreview = {
    lastUserMessage: null,
    lastAssistantText: null,
    assistantIsNewer: false,
    lastTools: [],
    messageCount: 0,
  };
  let hasError = false;
  let askingForInput = false;
  let pendingToolUse = false;
  let jsonlMtime: Date | null = null;
  let lastActivity = now.toISOString();
  let taskSummary: ClaudeSession["taskSummary"] = null;

  if (jsonlPath) {
    const [tailLines, headLines, mtime] = await Promise.all([
      readJsonlTail(jsonlPath),
      readJsonlHead(jsonlPath),
      getJsonlMtime(jsonlPath),
    ]);

    jsonlMtime = mtime;
    sessionId = hookStatus?.sessionId ?? extractSessionId(tailLines) ?? sessionId;
    startedAt = extractStartedAt(tailLines);
    branch = extractBranch(tailLines);
    preview = extractPreview(tailLines);
    hasError = lastMessageHasError(tailLines);
    askingForInput = isAskingForInput(tailLines);
    pendingToolUse = hasPendingToolUse(tailLines);
    taskSummary = extractTaskSummary(headLines);
    if (mtime) {
      lastActivity = mtime.toISOString();
    }
  }

  return {
    id: sessionId,
    provider: "claude",
    pid: info.pid,
    workingDirectory: info.workingDirectory,
    repoName: repoNameFromPath(info.workingDirectory),
    branch,
    status:
      hookStatus?.status ??
      classifyStatus({
        pid: info.pid,
        jsonlMtime,
        cpuPercent: info.cpuPercent,
        hasError,
        isAskingForInput: askingForInput,
        hasPendingToolUse: pendingToolUse,
      }),
    lastActivity,
    startedAt,
    preview,
    taskSummary,
    hasPendingToolUse: pendingToolUse,
    jsonlPath,
    transcriptSource: hookStatus?.transcriptPath ? "hook" : jsonlPath ? "fallback" : null,
    sessionMinutes: computeSessionMinutes(startedAt, now),
  };
}

export async function discoverClaudeSessions(now = new Date()): Promise<ClaudeSession[]> {
  const [processTree, hookStatuses] = await Promise.all([buildProcessTree(), readAllHookStatuses()]);
  const pids = findClaudePidsFromTree(processTree);
  const processInfos = await getAllProcessInfos(pids, processTree);
  const activePids = new Set(pids);

  const claimedPaths = new Set<string>();
  for (const [pid, hook] of hookStatuses.entries()) {
    if (hook.transcriptPath && activePids.has(pid)) {
      claimedPaths.add(hook.transcriptPath);
    }
  }

  const sessions = await Promise.all(
    processInfos
      .filter((info) => info.workingDirectory !== null)
      .map((info) => buildSession(info, hookStatuses.get(info.pid), claimedPaths, now)),
  );

  return sessions
    .filter((session): session is ClaudeSession => session !== null)
    .sort((left, right) => Date.parse(right.lastActivity) - Date.parse(left.lastActivity));
}

function computeSessionMinutes(startedAt: string | null, now: Date) {
  if (!startedAt) return 0;
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return 0;
  return Math.max(1, Math.round((now.getTime() - startedMs) / 60000));
}
