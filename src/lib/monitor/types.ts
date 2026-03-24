export type SessionStatus = "working" | "idle" | "waiting" | "errored" | "finished";

export interface ToolInfo {
  name: string;
  input: string | null;
  description: string | null;
  warnings: string[];
}

export interface ConversationPreview {
  lastUserMessage: string | null;
  lastAssistantText: string | null;
  assistantIsNewer: boolean;
  lastTools: ToolInfo[];
  messageCount: number;
}

export interface TaskSummary {
  title: string;
  description: string | null;
  source: "linear" | "prompt" | "user";
  ticketId: string | null;
  ticketUrl: string | null;
}

export interface ClaudeSession {
  id: string;
  provider: "claude";
  pid: number | null;
  workingDirectory: string;
  repoName: string | null;
  branch: string | null;
  status: SessionStatus;
  lastActivity: string;
  startedAt: string | null;
  preview: ConversationPreview;
  taskSummary: TaskSummary | null;
  hasPendingToolUse: boolean;
  jsonlPath: string | null;
  transcriptSource: "hook" | "fallback" | null;
  sessionMinutes: number;
}

export interface ProcessTreeEntry {
  ppid: number;
  cpuPercent: number;
  comm: string;
}
