import { open, readFile, stat } from "fs/promises";
import {
  HEAD_CHUNK_BYTES_PER_LINE,
  JSONL_HEAD_LINES,
  JSONL_TAIL_LINES,
  PREVIEW_TEXT_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TAIL_CHUNK_BYTES_PER_LINE,
} from "./constants";
import type { ConversationPreview, TaskSummary, ToolInfo } from "./types";

interface JsonlLine {
  type: string;
  subtype?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  message?: {
    role?: string;
    stop_reason?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
}

export async function getJsonlMtime(jsonlPath: string): Promise<Date | null> {
  try {
    const stats = await stat(jsonlPath);
    return stats.mtime;
  } catch {
    return null;
  }
}

export async function readJsonlHead(jsonlPath: string, lines = JSONL_HEAD_LINES): Promise<JsonlLine[]> {
  try {
    const chunkSize = lines * HEAD_CHUNK_BYTES_PER_LINE;
    const handle = await open(jsonlPath, "r");
    try {
      const fileStats = await handle.stat();
      const buffer = Buffer.alloc(Math.min(chunkSize, fileStats.size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      return parseJsonlChunk(buffer.toString("utf-8", 0, bytesRead).split("\n").filter(Boolean).slice(0, lines));
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

export async function readJsonlTail(jsonlPath: string, lines = JSONL_TAIL_LINES): Promise<JsonlLine[]> {
  try {
    const handle = await open(jsonlPath, "r");
    try {
      const fileStats = await handle.stat();
      const chunkSize = Math.min(lines * TAIL_CHUNK_BYTES_PER_LINE, fileStats.size);
      const offset = Math.max(0, fileStats.size - chunkSize);
      const buffer = Buffer.alloc(chunkSize);
      const { bytesRead } = await handle.read(buffer, 0, chunkSize, offset);
      const rawLines = buffer.toString("utf-8", 0, bytesRead).split("\n").filter(Boolean);
      const linesToParse = offset > 0 ? rawLines.slice(1) : rawLines;
      return parseJsonlChunk(linesToParse.slice(-lines));
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

export async function readFullConversation(jsonlPath: string): Promise<JsonlLine[]> {
  try {
    const content = await readFile(jsonlPath, "utf8");
    return parseJsonlChunk(content.trim().split("\n").filter(Boolean));
  } catch {
    return [];
  }
}

export function extractSessionId(lines: JsonlLine[]): string | null {
  for (const line of lines) {
    if (line.sessionId) return line.sessionId;
  }
  return null;
}

export function extractStartedAt(lines: JsonlLine[]): string | null {
  for (const line of lines) {
    if (line.timestamp) return line.timestamp;
  }
  return null;
}

export function extractBranch(lines: JsonlLine[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].gitBranch) {
      return lines[index].gitBranch ?? null;
    }
  }
  return null;
}

export function extractPreview(lines: JsonlLine[]): ConversationPreview {
  let lastUserMessage: string | null = null;
  let lastAssistantText: string | null = null;
  let assistantIsNewer = false;
  let lastTools: ToolInfo[] = [];
  let messageCount = 0;

  for (const line of lines) {
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "user" && typeof line.message.content === "string") {
      const text = line.message.content.trim();

      if (text === "/clear" || text.includes("<command-name>/clear</command-name>")) {
        lastUserMessage = null;
        lastAssistantText = null;
        assistantIsNewer = false;
        lastTools = [];
        messageCount = 0;
        continue;
      }

      if (isSystemMessage(text)) {
        const cleaned = stripXmlTags(text);
        if (cleaned) {
          lastUserMessage = cleaned.slice(0, PREVIEW_TEXT_MAX_LENGTH);
          assistantIsNewer = false;
          messageCount += 1;
        }
        continue;
      }

      lastUserMessage = text.slice(0, PREVIEW_TEXT_MAX_LENGTH);
      assistantIsNewer = false;
      messageCount += 1;
    } else if (line.type === "assistant" && Array.isArray(line.message.content)) {
      messageCount += 1;
      const turnTools: ToolInfo[] = [];
      for (const block of line.message.content) {
        if (block.type === "text" && block.text) {
          lastAssistantText = block.text.slice(0, PREVIEW_TEXT_MAX_LENGTH);
        }
        if (block.type === "tool_use" && block.name) {
          turnTools.push({
            name: block.name,
            input: summarizeToolInput(block.name, block.input),
            description: block.input && typeof block.input.description === "string" ? block.input.description : null,
            warnings: detectCommandWarnings(block.name, block.input),
          });
        }
      }
      lastTools = turnTools;
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

export function lastMessageHasError(lines: JsonlLine[]): boolean {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "assistant" && Array.isArray(line.message.content)) {
      for (const block of line.message.content) {
        if (block.type !== "text" || !block.text) continue;
        const lower = block.text.toLowerCase();
        if (lower.includes("error") && lower.includes("failed")) {
          return true;
        }
      }
    }

    break;
  }
  return false;
}

export function hasPendingToolUse(lines: JsonlLine[]): boolean {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;
    if (!line.message) continue;

    if (line.type === "assistant" && Array.isArray(line.message.content)) {
      return line.message.content.some((block) => block.type === "tool_use");
    }

    return false;
  }
  return false;
}

export function isAskingForInput(lines: JsonlLine[]): boolean {
  let lastAssistant: JsonlLine | null = null;
  let assistantTurnCount = 0;
  let hasToolUseInSession = false;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.type === "progress" || line.type === "file-history-snapshot" || line.type === "system") continue;

    if (line.type === "assistant" && line.message && Array.isArray(line.message.content)) {
      assistantTurnCount += 1;
      if (!lastAssistant) lastAssistant = line;
      if (line.message.content.some((block) => block.type === "tool_use")) {
        hasToolUseInSession = true;
      }
    }

    if (line.type === "user" && !lastAssistant) {
      return false;
    }
  }

  if (!lastAssistant?.message || !Array.isArray(lastAssistant.message.content)) {
    return false;
  }

  const content = lastAssistant.message.content;
  if (content.some((block) => block.type === "tool_use")) {
    return false;
  }

  if (lastAssistant.message.stop_reason !== "end_turn") {
    return false;
  }

  if (assistantTurnCount <= 1 && !hasToolUseInSession) {
    return false;
  }

  const textBlocks = content.filter((block) => block.type === "text" && block.text);
  if (textBlocks.length === 0) {
    return false;
  }

  const fullText = textBlocks.map((block) => block.text || "").join("\n");
  const lower = fullText.toLowerCase();

  const greetingPatterns = [
    /^(hey|hi|hello)[\s!.,]*what can i help/i,
    /^(hey|hi|hello)[\s!.,]*how can i (help|assist)/i,
    /what (can|would you like me to|shall) i help.*with/i,
    /how can i (help|assist) you/i,
  ];
  for (const pattern of greetingPatterns) {
    if (pattern.test(fullText.trim())) {
      return false;
    }
  }

  return (
    lower.includes("shall i proceed") ||
    lower.includes("should i proceed") ||
    lower.includes("shall i go ahead") ||
    lower.includes("should i go ahead") ||
    lower.includes("would you like me to") ||
    lower.includes("please confirm") ||
    lower.includes("which approach") ||
    lower.includes("which option") ||
    lower.includes("do you want me to") ||
    (lower.includes("before i ") && fullText.includes("?")) ||
    lower.includes("is that okay") ||
    lower.includes("does that look right") ||
    (lower.includes("let me know") && (lower.includes("prefer") || lower.includes("choose") || lower.includes("decision")))
  );
}

export function extractTaskSummary(headLines: JsonlLine[]): TaskSummary | null {
  for (const line of headLines) {
    if (line.type !== "user" || !line.message || !Array.isArray(line.message.content)) continue;

    for (const block of line.message.content) {
      if (block.type !== "tool_result") continue;
      const innerContent = (block as Record<string, unknown>).content;
      if (!Array.isArray(innerContent)) continue;

      for (const inner of innerContent as Array<Record<string, unknown>>) {
        if (inner.type !== "text" || typeof inner.text !== "string") continue;
        try {
          const data = JSON.parse(inner.text) as {
            title?: string;
            identifier?: string;
            id?: string;
            description?: string;
            url?: string;
          };
          if (!data.title || !(data.identifier || data.id)) continue;

          const description = data.description
            ? normalizeTaskDescription(data.description)
            : null;

          return {
            title: data.title,
            description,
            source: "linear",
            ticketId: data.identifier ?? data.id ?? null,
            ticketUrl: data.url ?? null,
          };
        } catch {
          continue;
        }
      }
    }
  }

  for (const line of headLines) {
    if (line.type !== "user" || !line.message || typeof line.message.content !== "string") continue;

    let text = line.message.content.trim();
    if (!text) continue;

    if (isSystemMessage(text)) {
      const cleaned = stripXmlTags(text);
      if (!cleaned) continue;
      text = cleaned;
    }

    const generic = /^(implement|start|work on|fix|do)\s+(the\s+)?(linear|referenced|ticket)/i;
    if (generic.test(text) && text.length < 100) continue;

    const textLines = text.split("\n").filter((value) => value.trim());
    const rawTitle = textLines[0].replace(/^#+\s*/, "");
    const title =
      rawTitle.length > TASK_TITLE_MAX_LENGTH ? `${rawTitle.slice(0, TASK_TITLE_MAX_LENGTH - 3)}...` : rawTitle;
    const rawDescription = textLines.length > 1 ? textLines.slice(1).join(" ") : null;
    const description =
      rawDescription && rawDescription.length > TASK_DESCRIPTION_MAX_LENGTH
        ? `${rawDescription.slice(0, TASK_DESCRIPTION_MAX_LENGTH - 3)}...`
        : rawDescription;

    return {
      title,
      description: description ?? null,
      source: "prompt",
      ticketId: null,
      ticketUrl: null,
    };
  }

  return null;
}

function parseJsonlChunk(lines: string[]): JsonlLine[] {
  const parsed: JsonlLine[] = [];
  for (const line of lines) {
    try {
      parsed.push(JSON.parse(line) as JsonlLine);
    } catch {
      continue;
    }
  }
  return parsed;
}

function isSystemMessage(text: string): boolean {
  return /^<[a-zA-Z]/.test(text.trim());
}

function stripXmlTags(text: string): string | null {
  const stripped = text
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function detectCommandWarnings(name: string, input?: Record<string, unknown>): string[] {
  if (name !== "Bash" || !input || typeof input.command !== "string") return [];
  const warnings: string[] = [];
  const command = input.command;
  if (/\$\(/.test(command)) warnings.push("Command contains $() substitution");
  if (/`[^`]+`/.test(command)) warnings.push("Command contains backtick substitution");
  if (/\|\s*(sudo|bash|sh|zsh)\b/.test(command)) warnings.push("Pipes to a shell interpreter");
  if (/\brm\s+(-\w*r|-\w*f)/.test(command)) warnings.push("Recursive or forced deletion");
  if (/\bsudo\b/.test(command)) warnings.push("Runs with elevated privileges");
  if (/--force|--hard/.test(command)) warnings.push("Uses force or hard flags");
  if (/\beval\b/.test(command)) warnings.push("Uses eval");
  return warnings;
}

function summarizeToolInput(name: string, input?: Record<string, unknown>): string | null {
  if (!input) return null;
  switch (name) {
    case "Bash":
      return typeof input.command === "string" ? input.command.slice(0, PREVIEW_TEXT_MAX_LENGTH) : null;
    case "Edit":
    case "Read":
    case "Write":
      return typeof input.file_path === "string" ? input.file_path : null;
    case "Glob":
      return typeof input.pattern === "string" ? input.pattern : null;
    case "Grep":
      return typeof input.pattern === "string" ? `/${input.pattern}/` : null;
    case "Skill":
      return typeof input.skill === "string" ? input.skill : null;
    case "Agent":
      return typeof input.description === "string"
        ? input.description
        : typeof input.prompt === "string"
          ? input.prompt.slice(0, PREVIEW_TEXT_MAX_LENGTH)
          : null;
    default: {
      for (const value of Object.values(input)) {
        if (typeof value === "string" && value.length > 0 && value.length <= PREVIEW_TEXT_MAX_LENGTH) {
          return value;
        }
      }
      return null;
    }
  }
}

function normalizeTaskDescription(value: string): string {
  const cleaned = value
    .replace(/\\n/g, "\n")
    .replace(/\n+/g, " · ")
    .replace(/^\s*\*\s*/g, "")
    .replace(/\s*\*\s*/g, " · ")
    .trim();
  return cleaned.length > TASK_DESCRIPTION_MAX_LENGTH
    ? `${cleaned.slice(0, TASK_DESCRIPTION_MAX_LENGTH - 3)}...`
    : cleaned;
}
