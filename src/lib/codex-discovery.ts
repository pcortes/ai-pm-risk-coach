import { execFile } from "child_process";
import { readdir, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { CODEX_APP_SERVER_SOURCE } from "./codex-app-server";
import { loadManagedCodexSessions, type ManagedCodexSessionRecord } from "./codex-managed-store";
import { CODEX_MANAGED_CAPABILITIES, CODEX_MONITOR_CAPABILITIES, ClaudeSession, SessionDetail } from "./types";
import {
  codexLastEventHasError,
  codexRecordsToConversation,
  extractCodexPreview,
  extractCodexTaskSummary,
  hasCodexPendingToolUse,
  isCodexAskingForInput,
  readCodexJsonlTail,
  readFullCodexConversation,
} from "./codex-reader";
import { classifyCodexStatus } from "./codex-status";
import { getGitDiff, getGitSummary, getMainWorktreePath, getPrUrl } from "./git-info";
import { repoNameFromPath } from "./paths";

const execFileAsync = promisify(execFile);
const CODEX_DIR = join(homedir(), ".codex");
const CODEX_ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const CODEX_THREAD_LIMIT = 40;

interface CodexThreadRow {
  id: string;
  rollout_path: string | null;
  created_at: number;
  updated_at: number;
  source: string;
  model_provider: string;
  cwd: string;
  title: string;
  git_branch: string | null;
  git_origin_url: string | null;
  cli_version: string;
  first_user_message: string;
  model: string | null;
  reasoning_effort: string | null;
  agent_nickname: string | null;
}

interface ParsedCodexSource {
  label: string;
  isTopLevel: boolean;
  isManaged: boolean;
}

async function findLatestCodexStateDb(): Promise<string | null> {
  try {
    const entries = await readdir(CODEX_DIR);
    const candidates = entries.filter((entry) => /^state_\d+\.sqlite$/.test(entry));
    if (candidates.length === 0) return null;

    const withStats = await Promise.all(
      candidates.map(async (entry) => {
        const path = join(CODEX_DIR, entry);
        try {
          const fileStat = await stat(path);
          return { path, mtimeMs: fileStat.mtimeMs };
        } catch {
          return null;
        }
      }),
    );

    return (
      withStats
        .filter((entry): entry is { path: string; mtimeMs: number } => entry !== null)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null
    );
  } catch {
    return null;
  }
}

async function querySqliteJson<T>(dbPath: string, query: string): Promise<T[]> {
  try {
    const { stdout } = await execFileAsync("sqlite3", ["-json", dbPath, query], { timeout: 5000 });
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function isTopLevelThread(source: string, agentNickname: string | null): boolean {
  return parseCodexSource(source, agentNickname).isTopLevel;
}

function buildCodexSessionId(threadId: string): string {
  return `codex:${threadId}`;
}

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function toUnixSeconds(iso: string): number {
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

export function parseCodexSource(source: string, agentNickname: string | null): ParsedCodexSource {
  if (agentNickname) {
    return {
      label: source || "subagent",
      isTopLevel: false,
      isManaged: false,
    };
  }

  const trimmed = source.trim();
  if (!trimmed) {
    return {
      label: "unknown",
      isTopLevel: true,
      isManaged: false,
    };
  }

  if (!trimmed.startsWith("{")) {
    return {
      label: trimmed,
      isTopLevel: true,
      isManaged: trimmed === CODEX_APP_SERVER_SOURCE,
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as { custom?: unknown; subagent?: unknown };
    if (parsed.subagent) {
      return {
        label: "subagent",
        isTopLevel: false,
        isManaged: false,
      };
    }

    if (typeof parsed.custom === "string") {
      return {
        label: parsed.custom,
        isTopLevel: true,
        isManaged: parsed.custom === CODEX_APP_SERVER_SOURCE,
      };
    }
  } catch {
    // fall through
  }

  return {
    label: trimmed,
    isTopLevel: true,
    isManaged: false,
  };
}

function managedSessionToThreadRow(session: ManagedCodexSessionRecord): CodexThreadRow {
  return {
    id: session.threadId,
    rollout_path: session.rolloutPath,
    created_at: toUnixSeconds(session.createdAt),
    updated_at: toUnixSeconds(session.updatedAt),
    source: JSON.stringify({ custom: session.providerSource }),
    model_provider: "openai",
    cwd: session.workingDirectory,
    title: "",
    git_branch: null,
    git_origin_url: null,
    cli_version: "",
    first_user_message: "",
    model: session.model,
    reasoning_effort: session.reasoningEffort,
    agent_nickname: null,
  };
}

function mergeThreadRows(dbRows: CodexThreadRow[], managedRows: CodexThreadRow[]): CodexThreadRow[] {
  const merged = new Map<string, CodexThreadRow>();

  for (const row of dbRows) {
    merged.set(row.id, row);
  }

  for (const row of managedRows) {
    const existing = merged.get(row.id);
    if (!existing) {
      merged.set(row.id, row);
      continue;
    }

    merged.set(row.id, {
      ...row,
      ...existing,
      rollout_path: existing.rollout_path ?? row.rollout_path,
      source: row.source || existing.source,
      cwd: existing.cwd || row.cwd,
      model: existing.model ?? row.model,
      reasoning_effort: existing.reasoning_effort ?? row.reasoning_effort,
      created_at: existing.created_at || row.created_at,
      updated_at: Math.max(existing.updated_at, row.updated_at),
    });
  }

  return Array.from(merged.values());
}

async function listRecentCodexThreads(): Promise<CodexThreadRow[]> {
  const dbPath = await findLatestCodexStateDb();
  const managedRows = (await loadManagedCodexSessions()).map(managedSessionToThreadRow);
  if (!dbPath) {
    const cutoff = Date.now() - CODEX_ACTIVE_WINDOW_MS;
    return managedRows.filter((row) => row.updated_at * 1000 >= cutoff && !!row.cwd);
  }

  const dbRows = await querySqliteJson<CodexThreadRow>(
    dbPath,
    `SELECT
        id,
        rollout_path,
        created_at,
        updated_at,
        source,
        model_provider,
        cwd,
        title,
        git_branch,
        git_origin_url,
        cli_version,
        first_user_message,
        model,
        reasoning_effort,
        agent_nickname
      FROM threads
      WHERE archived = 0
      ORDER BY updated_at DESC
      LIMIT ${CODEX_THREAD_LIMIT};`,
  );

  const rows = mergeThreadRows(dbRows, managedRows);
  const cutoff = Date.now() - CODEX_ACTIVE_WINDOW_MS;
  return rows.filter(
    (row) => isTopLevelThread(row.source, row.agent_nickname) && row.updated_at * 1000 >= cutoff && !!row.cwd,
  );
}

async function getCodexThreadById(rawId: string): Promise<CodexThreadRow | null> {
  const dbPath = await findLatestCodexStateDb();
  const managedRows = (await loadManagedCodexSessions()).map(managedSessionToThreadRow);
  if (!dbPath) {
    return managedRows.find((row) => row.id === rawId) ?? null;
  }

  const escapedId = rawId.replace(/'/g, "''");
  const rows = await querySqliteJson<CodexThreadRow>(
    dbPath,
    `SELECT
        id,
        rollout_path,
        created_at,
        updated_at,
        source,
        model_provider,
        cwd,
        title,
        git_branch,
        git_origin_url,
        cli_version,
        first_user_message,
        model,
        reasoning_effort,
        agent_nickname
      FROM threads
      WHERE id = '${escapedId}'
      LIMIT 1;`,
  );

  return mergeThreadRows(rows, managedRows.filter((row) => row.id === rawId))[0] ?? null;
}

async function buildCodexSession(thread: CodexThreadRow): Promise<ClaudeSession | null> {
  if (!thread.cwd) return null;
  const parsedSource = parseCodexSource(thread.source, thread.agent_nickname);

  const [tailRecords, git, mainWorktreePath] = await Promise.all([
    thread.rollout_path ? readCodexJsonlTail(thread.rollout_path) : Promise.resolve([]),
    getGitSummary(thread.cwd),
    getMainWorktreePath(thread.cwd),
  ]);

  const preview = extractCodexPreview(tailRecords);
  const hasPendingToolUse = hasCodexPendingToolUse(tailRecords);
  const isAskingForInput = isCodexAskingForInput(tailRecords);
  const hasError = codexLastEventHasError(tailRecords);
  const startedAt = toIso(thread.created_at);
  const lastActivity = toIso(thread.updated_at);
  const branch = git?.branch ?? thread.git_branch ?? null;
  const skipPrLookup = !branch || branch === "main" || branch === "master";
  const prUrl = skipPrLookup ? null : await getPrUrl(thread.cwd, branch);
  const isWorktree = mainWorktreePath !== null && mainWorktreePath !== thread.cwd;
  const parentRepo = isWorktree ? mainWorktreePath : null;

  return {
    id: buildCodexSessionId(thread.id),
    provider: "codex",
    providerSessionId: thread.id,
    providerSource: parsedSource.label,
    capabilities: parsedSource.isManaged ? CODEX_MANAGED_CAPABILITIES : CODEX_MONITOR_CAPABILITIES,
    pid: null,
    workingDirectory: thread.cwd,
    repoName: repoNameFromPath(thread.cwd),
    parentRepo,
    isWorktree,
    branch,
    status: classifyCodexStatus({
      updatedAtIso: lastActivity,
      hasError,
      isAskingForInput,
      hasPendingToolUse,
      assistantIsNewer: preview.assistantIsNewer,
    }),
    lastActivity,
    startedAt,
    git,
    preview,
    taskSummary: extractCodexTaskSummary(thread.title, thread.first_user_message),
    hasPendingToolUse,
    jsonlPath: thread.rollout_path,
    prUrl,
    model: thread.model,
    reasoningEffort: thread.reasoning_effort,
  };
}

export async function discoverCodexSessions(): Promise<ClaudeSession[]> {
  const threads = await listRecentCodexThreads();
  const sessions = await Promise.all(threads.map((thread) => buildCodexSession(thread)));
  return sessions.filter((session): session is ClaudeSession => session !== null);
}

export async function getCodexSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  if (!sessionId.startsWith("codex:")) return null;

  const rawId = sessionId.slice("codex:".length);
  const thread = await getCodexThreadById(rawId);
  if (!thread) return null;

  const session = await buildCodexSession(thread);
  if (!session) return null;

  const [records, gitDiff] = await Promise.all([
    thread.rollout_path ? readFullCodexConversation(thread.rollout_path) : Promise.resolve([]),
    getGitDiff(thread.cwd),
  ]);

  return {
    ...session,
    conversation: codexRecordsToConversation(records),
    gitDiff,
  };
}
