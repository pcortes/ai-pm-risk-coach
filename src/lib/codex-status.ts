import { SessionStatus } from "./types";

const WORKING_RECENT_MS = 60 * 1000;
const IDLE_RECENT_MS = 20 * 60 * 1000;
const APPROVAL_SETTLE_MS = 5 * 1000;

interface CodexStatusInput {
  updatedAtIso: string;
  hasError: boolean;
  isAskingForInput: boolean;
  hasPendingToolUse: boolean;
  assistantIsNewer: boolean;
}

export function classifyCodexStatus(input: CodexStatusInput): SessionStatus {
  if (input.hasError) return "errored";

  const age = Date.now() - new Date(input.updatedAtIso).getTime();

  if (input.hasPendingToolUse) {
    return age > APPROVAL_SETTLE_MS ? "waiting" : "working";
  }

  if (input.isAskingForInput) return "waiting";

  if (!input.assistantIsNewer) {
    if (age < WORKING_RECENT_MS * 2) return "working";
    return age < IDLE_RECENT_MS ? "idle" : "finished";
  }

  if (age < WORKING_RECENT_MS) return "working";
  if (age < IDLE_RECENT_MS) return "idle";
  return "finished";
}
