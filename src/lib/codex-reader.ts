import { open, readFile } from "fs/promises";
import { ConversationMessage, ConversationPreview, TaskSummary, ToolInfo } from "./types";
import {
  HEAD_CHUNK_BYTES_PER_LINE,
  JSONL_HEAD_LINES,
  JSONL_TAIL_LINES,
  PREVIEW_TEXT_MAX_LENGTH,
  TAIL_CHUNK_BYTES_PER_LINE,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
} from "./constants";

interface CodexContentItem {
  type?: string;
  text?: string;
}

interface CodexPayload {
  type?: string;
  role?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  output?: string;
  status?: string;
  content?: CodexContentItem[];
}

export interface CodexJsonlRecord {
  timestamp?: string;
  type?: string;
  payload?: CodexPayload;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractMessageText(content?: CodexContentItem[]): string | null {
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((item) => item.type === "input_text" || item.type === "output_text")
    .map((item) => item.text?.trim())
    .filter((value): value is string => !!value)
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function parseToolArguments(argumentsText?: string): Record<string, unknown> | undefined {
  if (!argumentsText) return undefined;
  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return undefined;
}

function detectCommandWarnings(command: string): string[] {
  const warnings: string[] = [];
  if (/\$\(/.test(command)) warnings.push("Command contains $() command substitution");
  if (/`[^`]+`/.test(command)) warnings.push("Command contains backtick substitution");
  if (/\|\s*(sudo|bash|sh|zsh)\b/.test(command)) warnings.push("Pipes to shell interpreter");
  if (/\brm\s+(-\w*r|-\w*f)/.test(command)) warnings.push("Recursive or forced file deletion");
  if (/\bsudo\b/.test(command)) warnings.push("Runs with elevated privileges");
  if (/--force|--hard/.test(command)) warnings.push("Uses force/hard flag");
  if (/\beval\b/.test(command)) warnings.push("Uses eval");
  return warnings;
}

function summarizeToolInput(name: string, args?: Record<string, unknown>, rawArguments?: string): string | null {
  if (!args) {
    return rawArguments ? clip(rawArguments, PREVIEW_TEXT_MAX_LENGTH) : null;
  }

  switch (name) {
    case "exec_command":
      return typeof args.cmd === "string" ? clip(args.cmd, PREVIEW_TEXT_MAX_LENGTH) : null;
    case "write_stdin":
      return typeof args.chars === "string" ? clip(args.chars, PREVIEW_TEXT_MAX_LENGTH) : null;
    case "apply_patch":
      return typeof args.patch === "string"
        ? "Apply patch"
        : rawArguments
          ? clip(rawArguments, PREVIEW_TEXT_MAX_LENGTH)
          : null;
    default:
      for (const value of Object.values(args)) {
        if (typeof value === "string" && value.length > 0) {
          return clip(value, PREVIEW_TEXT_MAX_LENGTH);
        }
      }
      return rawArguments ? clip(rawArguments, PREVIEW_TEXT_MAX_LENGTH) : null;
  }
}

function payloadToToolInfo(payload: CodexPayload): ToolInfo | null {
  const payloadType = payload.type ?? "";
  const toolName =
    payloadType === "function_call"
      ? (payload.name ?? null)
      : payloadType.endsWith("_call")
        ? payloadType.replace(/_call$/, "")
        : null;

  if (!toolName) return null;

  const args = parseToolArguments(payload.arguments);
  const command = toolName === "exec_command" && typeof args?.cmd === "string" ? args.cmd : null;

  return {
    name: toolName,
    input: summarizeToolInput(toolName, args, payload.arguments),
    description: null,
    warnings: command ? detectCommandWarnings(command) : [],
  };
}

async function readChunkedJsonl(path: string, mode: "head" | "tail", lines: number): Promise<CodexJsonlRecord[]> {
  try {
    const fh = await open(path, "r");
    try {
      const stats = await fh.stat();
      const chunkSizePerLine = mode === "head" ? HEAD_CHUNK_BYTES_PER_LINE : TAIL_CHUNK_BYTES_PER_LINE;
      const chunkSize = Math.min(lines * chunkSizePerLine, stats.size);
      const offset = mode === "tail" ? Math.max(0, stats.size - chunkSize) : 0;
      const buf = Buffer.alloc(chunkSize);
      const { bytesRead } = await fh.read(buf, 0, chunkSize, offset);
      const text = buf.toString("utf-8", 0, bytesRead);
      const allLines = text.split("\n").filter(Boolean);
      const scopedLines = mode === "tail" && offset > 0 ? allLines.slice(1).slice(-lines) : allLines.slice(0, lines);

      const parsed: CodexJsonlRecord[] = [];
      for (const line of scopedLines) {
        try {
          parsed.push(JSON.parse(line) as CodexJsonlRecord);
        } catch {
          // skip malformed lines
        }
      }
      return parsed;
    } finally {
      await fh.close();
    }
  } catch {
    return [];
  }
}

export async function readCodexJsonlHead(path: string, lines = JSONL_HEAD_LINES): Promise<CodexJsonlRecord[]> {
  return readChunkedJsonl(path, "head", lines);
}

export async function readCodexJsonlTail(path: string, lines = JSONL_TAIL_LINES): Promise<CodexJsonlRecord[]> {
  return readChunkedJsonl(path, "tail", lines);
}

export async function readFullCodexConversation(path: string): Promise<CodexJsonlRecord[]> {
  try {
    const content = await readFile(path, "utf-8");
    const parsed: CodexJsonlRecord[] = [];
    for (const line of content.split("\n").filter(Boolean)) {
      try {
        parsed.push(JSON.parse(line) as CodexJsonlRecord);
      } catch {
        // skip malformed lines
      }
    }
    return parsed;
  } catch {
    return [];
  }
}

export function extractCodexPreview(records: CodexJsonlRecord[]): ConversationPreview {
  let lastUserMessage: string | null = null;
  let lastAssistantText: string | null = null;
  let assistantIsNewer = false;
  let lastTools: ToolInfo[] = [];
  let messageCount = 0;
  let currentToolBurst: ToolInfo[] = [];

  for (const record of records) {
    if (record.type !== "response_item" || !record.payload) continue;
    const payload = record.payload;

    if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant")) {
      const text = extractMessageText(payload.content);
      currentToolBurst = [];
      if (!text) continue;

      if (payload.role === "user") {
        lastUserMessage = clip(text, PREVIEW_TEXT_MAX_LENGTH);
        assistantIsNewer = false;
      } else {
        lastAssistantText = clip(text, PREVIEW_TEXT_MAX_LENGTH);
        assistantIsNewer = true;
      }
      messageCount++;
      continue;
    }

    const tool = payloadToToolInfo(payload);
    if (tool) {
      currentToolBurst = [...currentToolBurst, tool];
      lastTools = currentToolBurst;
      assistantIsNewer = true;
    }
  }

  return {
    lastUserMessage,
    lastAssistantText,
    assistantIsNewer,
    lastTools,
    messageCount,
  };
}

export function isCodexAskingForInput(records: CodexJsonlRecord[]): boolean {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.type !== "response_item" || !record.payload) continue;
    const payload = record.payload;
    if (payload.type !== "message") continue;
    if (payload.role === "user") return false;
    if (payload.role !== "assistant") continue;

    const text = extractMessageText(payload.content)?.toLowerCase() ?? "";
    if (!text) return false;
    return (
      text.includes("?") ||
      /should i|would you like|want me to|which option|can you confirm|how would you like|before i|do you want/i.test(
        text,
      )
    );
  }
  return false;
}

export function hasCodexPendingToolUse(records: CodexJsonlRecord[]): boolean {
  const pending = new Set<string>();

  for (const record of records) {
    if (record.type !== "response_item" || !record.payload) continue;
    const payload = record.payload;
    if (payload.type === "function_call" && payload.call_id) {
      pending.add(payload.call_id);
    }
    if (payload.type === "function_call_output" && payload.call_id) {
      pending.delete(payload.call_id);
    }
  }

  return pending.size > 0;
}

export function codexLastEventHasError(records: CodexJsonlRecord[]): boolean {
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.type !== "response_item" || !record.payload) continue;
    const payload = record.payload;

    if (payload.type === "message" && payload.role === "assistant") {
      const text = extractMessageText(payload.content)?.toLowerCase() ?? "";
      return /\berror\b|\bfailed\b|\bexception\b/.test(text);
    }

    if (payload.type === "function_call_output" && typeof payload.output === "string") {
      return /Process exited with code [1-9]\d*/.test(payload.output);
    }
  }
  return false;
}

export function codexRecordsToConversation(records: CodexJsonlRecord[]): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  let lastAssistantIndex = -1;

  for (const record of records) {
    if (record.type !== "response_item" || !record.payload) continue;
    const payload = record.payload;
    const timestamp = record.timestamp ?? new Date().toISOString();

    if (payload.type === "message" && (payload.role === "user" || payload.role === "assistant")) {
      const text = extractMessageText(payload.content);
      if (!text) continue;
      messages.push({
        type: payload.role,
        timestamp,
        text,
        toolUses: [],
      });
      lastAssistantIndex = payload.role === "assistant" ? messages.length - 1 : -1;
      continue;
    }

    const tool = payloadToToolInfo(payload);
    const args = parseToolArguments(payload.arguments);
    if (!tool) continue;

    const toolUse = {
      name: tool.name,
      input: args,
    };

    if (lastAssistantIndex >= 0) {
      messages[lastAssistantIndex].toolUses.push(toolUse);
    } else {
      messages.push({
        type: "assistant",
        timestamp,
        text: null,
        toolUses: [toolUse],
      });
      lastAssistantIndex = messages.length - 1;
    }
  }

  return messages;
}

export function extractCodexTaskSummary(title: string | null, firstUserMessage: string | null): TaskSummary | null {
  const raw = normalizeText(title || firstUserMessage || "");
  if (!raw) return null;

  const cleaned = normalizeText(raw.replace(/https?:\/\/\S+/g, ""));
  const basis = cleaned || raw;
  const shortTitle = clip(basis.split(/(?<=[.!?])\s+/)[0] || basis, TASK_TITLE_MAX_LENGTH);
  const description = basis.length > shortTitle.length ? clip(basis, TASK_DESCRIPTION_MAX_LENGTH) : null;

  return {
    title: shortTitle,
    description: description && description !== shortTitle ? description : null,
    source: "prompt",
    ticketId: null,
    ticketUrl: null,
  };
}
