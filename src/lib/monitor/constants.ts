import { homedir } from "os";
import { join } from "path";

export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
export const CLAUDE_CONTROL_EVENTS_DIR = join(homedir(), ".claude-control", "events");
export const JSONL_TAIL_LINES = 50;
export const JSONL_HEAD_LINES = 30;
export const HEAD_CHUNK_BYTES_PER_LINE = 2048;
export const TAIL_CHUNK_BYTES_PER_LINE = 10240;
export const PREVIEW_TEXT_MAX_LENGTH = 220;
export const TASK_TITLE_MAX_LENGTH = 120;
export const TASK_DESCRIPTION_MAX_LENGTH = 300;
export const PROCESS_TIMEOUT_MS = 5000;
export const WORKING_THRESHOLD_MS = 10 * 1000;
export const APPROVAL_SETTLE_MS = 3000;
