import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { upsertManagedCodexSession } from "./codex-managed-store";

const CODEX_APP_SERVER_SOURCE = "claude-control";
const REQUEST_TIMEOUT_MS = 20_000;
const INITIALIZE_TIMEOUT_MS = 10_000;

type JsonObject = Record<string, unknown>;

interface RpcSuccess<T> {
  id: string | number;
  result: T;
}

interface RpcError {
  id: string | number;
  error: {
    code?: number;
    message?: string;
  };
}

interface RpcNotification {
  method: string;
  params?: JsonObject;
}

interface ThreadStatus {
  type: "notLoaded" | "idle" | "systemError" | "active";
}

interface ThreadTurn {
  id: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
}

interface ThreadSnapshot {
  id: string;
  path: string | null;
  cwd: string;
  source: string | { custom: string } | { subagent: unknown } | "unknown";
  status: ThreadStatus;
  turns: ThreadTurn[];
}

interface ThreadStartResponse {
  thread: ThreadSnapshot;
  model?: string | null;
  reasoningEffort?: string | null;
}

interface ThreadReadResponse {
  thread: ThreadSnapshot;
}

interface ThreadResumeResponse {
  thread: ThreadSnapshot;
}

interface TurnStartResponse {
  turn: ThreadTurn;
}

interface LoadedThreadListResponse {
  data: string[];
  nextCursor: string | null;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function nowIso(): string {
  return new Date().toISOString();
}

function textInput(text: string) {
  return [{ type: "text", text, text_elements: [] }];
}

function normalizeSourceLabel(source: ThreadSnapshot["source"]): string {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "custom" in source && typeof source.custom === "string") {
    return source.custom;
  }
  return "unknown";
}

class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private startPromise: Promise<void> | null = null;
  private stderrLines: string[] = [];

  async request<T>(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    await this.ensureStarted();

    if (!this.child) {
      throw new Error("Codex app-server is not running");
    }

    const id = String(++this.requestCounter);

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out while calling ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });

      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.child.exitCode === null && !this.child.killed) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.start();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async start(): Promise<void> {
    this.child = spawn("codex", ["app-server", "--listen", "stdio://", "--session-source", CODEX_APP_SERVER_SOURCE], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.buffer = "";
    this.stderrLines = [];

    this.child.stdout.on("data", (chunk: Buffer | string) => this.handleStdout(chunk.toString("utf-8")));
    this.child.stderr.on("data", (chunk: Buffer | string) => this.handleStderr(chunk.toString("utf-8")));
    this.child.on("exit", (code, signal) => this.handleExit(code, signal));
    this.child.on("error", (error) => this.handleChildError(error));

    await this.request("initialize", {
      clientInfo: { name: CODEX_APP_SERVER_SOURCE, version: "0.0.0" },
      capabilities: {
        experimentalApi: true,
      },
    }, INITIALIZE_TIMEOUT_MS);
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const rawLine = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      newlineIndex = this.buffer.indexOf("\n");

      if (!rawLine) continue;

      let message: RpcSuccess<unknown> | RpcError | RpcNotification | null = null;
      try {
        message = JSON.parse(rawLine) as RpcSuccess<unknown> | RpcError | RpcNotification;
      } catch {
        continue;
      }

      if (message && "id" in message) {
        const pending = this.pending.get(String(message.id));
        if (!pending) continue;

        clearTimeout(pending.timeout);
        this.pending.delete(String(message.id));

        if ("error" in message) {
          pending.reject(new Error(message.error?.message || "Codex app-server request failed"));
          continue;
        }

        pending.resolve(message.result);
      }
    }
  }

  private handleStderr(chunk: string) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-20);
    this.stderrLines.push(...lines);
    this.stderrLines = this.stderrLines.slice(-50);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null) {
    const message = [`Codex app-server exited`, code !== null ? `with code ${code}` : null, signal ? `(${signal})` : null]
      .filter(Boolean)
      .join(" ");

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`${message}${this.stderrSuffix()}`));
      this.pending.delete(id);
    }

    this.child = null;
    this.buffer = "";
  }

  private handleChildError(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Codex app-server failed to start: ${error.message}`));
      this.pending.delete(id);
    }
    this.child = null;
  }

  private stderrSuffix(): string {
    const recent = this.stderrLines.filter((line) => !line.startsWith("WARNING:"));
    if (recent.length === 0) return "";
    return `: ${recent[recent.length - 1]}`;
  }
}

declare global {
  var __claudeControlCodexAppServer: CodexAppServerClient | undefined;
}

function getClient(): CodexAppServerClient {
  if (!globalThis.__claudeControlCodexAppServer) {
    globalThis.__claudeControlCodexAppServer = new CodexAppServerClient();
  }
  return globalThis.__claudeControlCodexAppServer;
}

async function ensureThreadLoaded(threadId: string): Promise<ThreadSnapshot> {
  const client = getClient();
  const loaded = await client.request<LoadedThreadListResponse>("thread/loaded/list", {});
  if (loaded.data.includes(threadId)) {
    try {
      const readResult = await client.request<ThreadReadResponse>("thread/read", { threadId, includeTurns: true });
      return readResult.thread;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/includeTurns is unavailable before first user message|not materialized yet/i.test(message)) {
        throw error;
      }

      const readResult = await client.request<ThreadReadResponse>("thread/read", { threadId, includeTurns: false });
      return {
        ...readResult.thread,
        turns: [],
      };
    }
  }

  const resumeResult = await client.request<ThreadResumeResponse>("thread/resume", {
    threadId,
    persistExtendedHistory: true,
  });
  return resumeResult.thread;
}

export async function startManagedCodexSession({
  cwd,
  prompt,
}: {
  cwd: string;
  prompt?: string;
}) {
  const client = getClient();
  const started = await client.request<ThreadStartResponse>("thread/start", {
    cwd,
    approvalPolicy: "never",
    experimentalRawEvents: false,
    persistExtendedHistory: true,
  });

  await upsertManagedCodexSession({
    threadId: started.thread.id,
    workingDirectory: cwd,
    rolloutPath: started.thread.path,
    providerSource: normalizeSourceLabel(started.thread.source),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    model: started.model ?? null,
    reasoningEffort: started.reasoningEffort ?? null,
  });

  if (prompt?.trim()) {
    await client.request<TurnStartResponse>("turn/start", {
      threadId: started.thread.id,
      input: textInput(prompt.trim()),
    });
  }

  return {
    threadId: started.thread.id,
    rolloutPath: started.thread.path,
    providerSource: normalizeSourceLabel(started.thread.source),
    model: started.model ?? null,
    reasoningEffort: started.reasoningEffort ?? null,
  };
}

export async function sendManagedCodexMessage({
  threadId,
  message,
}: {
  threadId: string;
  message: string;
}) {
  const client = getClient();
  const thread = await ensureThreadLoaded(threadId);
  const activeTurn = thread.turns.find((turn) => turn.status === "inProgress");

  if (activeTurn) {
    await client.request("turn/steer", {
      threadId,
      input: textInput(message),
      expectedTurnId: activeTurn.id,
    });
  } else {
    await client.request("turn/start", {
      threadId,
      input: textInput(message),
    });
  }

  await upsertManagedCodexSession({
    threadId,
    workingDirectory: thread.cwd,
    rolloutPath: thread.path,
    providerSource: normalizeSourceLabel(thread.source),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    model: null,
    reasoningEffort: null,
  });
}

export { CODEX_APP_SERVER_SOURCE };
