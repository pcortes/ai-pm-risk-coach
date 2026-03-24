import { readdir, stat, readFile, unlink } from "fs/promises";
import { join } from "path";
import { CLAUDE_CONTROL_EVENTS_DIR } from "./constants";
import type { SessionStatus } from "./types";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface HookStatus {
  status: SessionStatus | null;
  event: string;
  ts: number;
  cwd: string | null;
  sessionId: string | null;
  transcriptPath: string | null;
}

const EVENT_TO_STATUS: Record<string, SessionStatus> = {
  UserPromptSubmit: "working",
  SubagentStart: "working",
  PostToolUseFailure: "working",
  Stop: "idle",
  SessionStart: "idle",
  SessionEnd: "finished",
};

function classifyStatusFromHook(eventName: string): SessionStatus | null {
  return EVENT_TO_STATUS[eventName] ?? null;
}

export async function readAllHookStatuses(): Promise<Map<number, HookStatus>> {
  const result = new Map<number, HookStatus>();

  let entries: string[];
  try {
    entries = await readdir(CLAUDE_CONTROL_EVENTS_DIR);
  } catch {
    return result;
  }

  const now = Date.now();

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const filePath = join(CLAUDE_CONTROL_EVENTS_DIR, entry);

        try {
          const stats = await stat(filePath);
          if (now - stats.mtimeMs > STALE_THRESHOLD_MS) {
            await unlink(filePath).catch(() => {});
            return;
          }
        } catch {
          return;
        }

        let raw = "";
        try {
          raw = (await readFile(filePath, "utf8")).trim();
        } catch {
          return;
        }

        if (!raw) return;

        try {
          const parsed = JSON.parse(raw) as {
            event?: string;
            session_id?: string;
            cwd?: string;
            transcript_path?: string;
            ts?: number;
          };

          if (!parsed.event) return;

          const pid = parseInt(entry.replace(/\.json$/, ""), 10);
          if (Number.isNaN(pid)) return;

          result.set(pid, {
            status: classifyStatusFromHook(parsed.event),
            event: parsed.event,
            ts: parsed.ts ?? 0,
            cwd: parsed.cwd ?? null,
            sessionId: parsed.session_id ?? null,
            transcriptPath: parsed.transcript_path ?? null,
          });
        } catch {
          return;
        }
      }),
  );

  return result;
}
