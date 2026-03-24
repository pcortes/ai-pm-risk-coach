import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const STORE_DIR = join(homedir(), ".claude-control");
const STORE_FILE = join(STORE_DIR, "managed-codex-sessions.json");
const MAX_MANAGED_SESSIONS = 200;

export interface ManagedCodexSessionRecord {
  threadId: string;
  workingDirectory: string;
  rolloutPath: string | null;
  providerSource: string;
  createdAt: string;
  updatedAt: string;
  model: string | null;
  reasoningEffort: string | null;
}

interface ManagedCodexStoreShape {
  sessions: ManagedCodexSessionRecord[];
}

function normalizeStoreShape(parsed: unknown): ManagedCodexStoreShape {
  if (!parsed || typeof parsed !== "object") {
    return { sessions: [] };
  }

  const sessions = Array.isArray((parsed as { sessions?: unknown[] }).sessions)
    ? ((parsed as { sessions: unknown[] }).sessions.filter(
        (entry): entry is ManagedCodexSessionRecord =>
          !!entry &&
          typeof entry === "object" &&
          typeof (entry as ManagedCodexSessionRecord).threadId === "string" &&
          typeof (entry as ManagedCodexSessionRecord).workingDirectory === "string",
      ) as ManagedCodexSessionRecord[])
    : [];

  return { sessions };
}

export async function loadManagedCodexSessions(): Promise<ManagedCodexSessionRecord[]> {
  try {
    const raw = await readFile(STORE_FILE, "utf-8");
    return normalizeStoreShape(JSON.parse(raw)).sessions;
  } catch {
    return [];
  }
}

async function saveManagedCodexSessions(sessions: ManagedCodexSessionRecord[]): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true });
  const deduped = Array.from(new Map(sessions.map((session) => [session.threadId, session])).values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_MANAGED_SESSIONS);

  await writeFile(STORE_FILE, JSON.stringify({ sessions: deduped }, null, 2));
}

export async function upsertManagedCodexSession(session: ManagedCodexSessionRecord): Promise<void> {
  const existing = await loadManagedCodexSessions();
  const previous = existing.find((entry) => entry.threadId === session.threadId);
  const merged: ManagedCodexSessionRecord = previous
    ? {
        ...previous,
        ...session,
        rolloutPath: session.rolloutPath ?? previous.rolloutPath,
        providerSource: session.providerSource || previous.providerSource,
        createdAt: previous.createdAt,
        updatedAt: session.updatedAt,
        model: session.model ?? previous.model,
        reasoningEffort: session.reasoningEffort ?? previous.reasoningEffort,
      }
    : session;

  const next = existing.filter((entry) => entry.threadId !== session.threadId);
  next.push(merged);
  await saveManagedCodexSessions(next);
}
