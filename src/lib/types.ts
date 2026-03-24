export type ViewMode = "grid" | "list";

export type SessionStatus = "working" | "idle" | "waiting" | "errored" | "finished";
export type SessionProvider = "claude" | "codex";

export const statusLabels: Record<SessionStatus, string> = {
  working: "Working",
  idle: "Idle",
  waiting: "Waiting",
  errored: "Error",
  finished: "Finished",
};

export interface SessionCapabilities {
  focusTerminal: boolean;
  sendMessage: boolean;
  stageMessage: boolean;
  sendKeystroke: boolean;
  createPr: boolean;
}

export const CLAUDE_SESSION_CAPABILITIES: SessionCapabilities = {
  focusTerminal: true,
  sendMessage: true,
  stageMessage: true,
  sendKeystroke: true,
  createPr: true,
};

export const CODEX_MONITOR_CAPABILITIES: SessionCapabilities = {
  focusTerminal: false,
  sendMessage: false,
  stageMessage: false,
  sendKeystroke: false,
  createPr: false,
};

export const CODEX_MANAGED_CAPABILITIES: SessionCapabilities = {
  focusTerminal: false,
  sendMessage: true,
  stageMessage: false,
  sendKeystroke: false,
  createPr: false,
};

export interface AgentSession {
  id: string;
  provider: SessionProvider;
  providerSessionId: string;
  providerSource: string | null;
  capabilities: SessionCapabilities;
  pid: number | null;
  workingDirectory: string;
  repoName: string | null;
  parentRepo: string | null;
  isWorktree: boolean;
  branch: string | null;
  status: SessionStatus;
  lastActivity: string;
  startedAt: string | null;
  git: GitSummary | null;
  preview: ConversationPreview;
  taskSummary: TaskSummary | null;
  hasPendingToolUse: boolean;
  jsonlPath: string | null;
  prUrl: string | null;
  model: string | null;
  reasoningEffort: string | null;
}

export type ClaudeSession = AgentSession;

export interface GitSummary {
  branch: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  untrackedFiles: number;
  shortStat: string;
}

export interface ToolInfo {
  name: string;
  input: string | null;
  description: string | null;
  warnings: string[];
}

export interface ConversationPreview {
  lastUserMessage: string | null;
  lastAssistantText: string | null;
  /** Whether the assistant text came after the last user message */
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

export type PrChecks = "passing" | "failing" | "pending" | "none";
export type PrReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface PrStatus {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  checks: PrChecks;
  reviewDecision: PrReviewDecision;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: "BEHIND" | "BLOCKED" | "CLEAN" | "DIRTY" | "HAS_HOOKS" | "UNKNOWN" | "UNSTABLE";
  checksDetail?: { total: number; passing: number; failing: number; pending: number };
  unresolvedThreads: number;
  commentCount: number;
}

export interface SessionDetail extends ClaudeSession {
  conversation: ConversationMessage[];
  gitDiff: string | null;
}

export interface ConversationMessage {
  type: "user" | "assistant";
  timestamp: string;
  text: string | null;
  toolUses: { name: string; input?: Record<string, unknown> }[];
}

export interface SessionGroup {
  repoName: string;
  repoPath: string;
  sessions: ClaudeSession[];
}
