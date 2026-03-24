import { execFile } from "child_process";
import { promisify } from "util";
import { ActiveContext } from "./types";

const execFileAsync = promisify(execFile);

export async function getActiveContext(): Promise<ActiveContext> {
  const script = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
end tell
set frontTitle to ""
try
  tell application frontApp
    if (count of windows) > 0 then
      set frontTitle to name of front window
    end if
  end tell
end try
return frontApp & "||" & frontTitle
`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 4000 });
    const [appNameRaw, windowTitleRaw] = stdout.trim().split("||");
    const appName = appNameRaw?.trim() || null;
    const windowTitle = windowTitleRaw?.trim() || null;
    const workMode = inferWorkMode(appName, windowTitle);
    return {
      appName,
      windowTitle,
      workMode,
      opportunity: opportunityForWorkMode(workMode),
    };
  } catch {
    return {
      appName: null,
      windowTitle: null,
      workMode: "unknown",
      opportunity: "Unable to read the active window. You can still use the prompt coach and daily log.",
    };
  }
}

function inferWorkMode(appName: string | null, windowTitle: string | null) {
  const haystack = `${appName ?? ""} ${windowTitle ?? ""}`.toLowerCase();
  if (hasAny(haystack, ["chrome", "arc", "safari", "firefox", "browser"])) return "browser";
  if (hasAny(haystack, ["notion", "docs", "word", "pages", "coda"])) return "docs";
  if (hasAny(haystack, ["keynote", "slides", "powerpoint"])) return "slides";
  if (hasAny(haystack, ["calendar", "meeting", "zoom"])) return "meeting";
  if (hasAny(haystack, ["slack", "messag"])) return "slack";
  if (hasAny(haystack, ["notes", "obsidian", "drafts"])) return "notes";
  if (hasAny(haystack, ["terminal", "cursor", "code", "zed"])) return "research";
  return "general";
}

function opportunityForWorkMode(workMode: string) {
  switch (workMode) {
    case "docs":
      return "This is a strong moment to use AI for a decision memo, leadership brief, or tradeoff table.";
    case "browser":
      return "Use AI to turn reading into structured eval criteria, failure modes, and action items.";
    case "slides":
      return "Use AI to compress arguments into decision-ready slide language and likely objections.";
    case "meeting":
      return "Use AI to turn raw meeting notes into decisions, risks, and follow-up actions.";
    case "slack":
      return "Use AI to pressure-test a response before sending a cross-functional alignment message.";
    case "research":
      return "Use AI as a synthesis and eval-design partner, not just a summarizer.";
    default:
      return "Look for a chance to use AI on structure, critique, or decision framing instead of one-off drafting.";
  }
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}
