import { APPROVAL_SETTLE_MS, WORKING_THRESHOLD_MS } from "./constants";
import type { SessionStatus } from "./types";

interface ClassifyInput {
  pid: number | null;
  jsonlMtime: Date | null;
  cpuPercent: number;
  hasError: boolean;
  isAskingForInput: boolean;
  hasPendingToolUse: boolean;
}

export function classifyStatus(input: ClassifyInput): SessionStatus {
  if (input.pid === null) return "finished";
  if (input.hasError) return "errored";

  const now = Date.now();
  const age = now - (input.jsonlMtime?.getTime() ?? 0);
  const recentWrite = age < WORKING_THRESHOLD_MS;
  const cpuActive = input.cpuPercent > 5;

  if ((recentWrite && cpuActive) || input.cpuPercent > 15) {
    return "working";
  }

  if (input.hasPendingToolUse) {
    return age > APPROVAL_SETTLE_MS ? "waiting" : "working";
  }

  if (input.isAskingForInput) {
    return "waiting";
  }

  return "idle";
}
