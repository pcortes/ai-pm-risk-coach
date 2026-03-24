import { CoachUsageEntry, PromptAssessment, ScoreCard } from "./types";

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "should",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

export function assessPrompt(entry: CoachUsageEntry): PromptAssessment {
  if (entry.source === "auto" && entry.promptCaptureMode === "session_preview") {
    return assessSessionPreviewUsage(entry);
  }

  if (entry.source === "auto") {
    return assessAutoCapturedUsage(entry);
  }

  const prompt = entry.prompt.trim();
  const lowered = prompt.toLowerCase();
  const strengths: string[] = [];
  const gaps: string[] = [];
  const categories = detectCategories(entry);

  let score = 18;

  if (prompt.split(/\s+/).length >= 12) {
    score += 8;
  } else {
    gaps.push("Prompt is too short to carry enough context.");
    score -= 10;
  }

  if (hasAny(lowered, ["context", "background", "i need", "team", "for leadership", "here are"])) {
    strengths.push("Includes useful context.");
    score += 14;
  } else {
    gaps.push("Add context so the model knows the setting and stakes.");
  }

  if (hasAny(lowered, ["table", "memo", "brief", "rubric", "checklist", "bullet", "recommendation", "output format"])) {
    strengths.push("Asks for a concrete deliverable.");
    score += 14;
  } else {
    gaps.push("Specify the output shape: memo, table, rubric, checklist, or bullets.");
  }

  if (hasAny(lowered, ["must", "avoid", "criteria", "constraints", "audience", "tone", "only", "do not"])) {
    strengths.push("Defines useful constraints.");
    score += 10;
  } else {
    gaps.push("Add audience, constraints, or success criteria.");
  }

  if (hasAny(lowered, ["critique", "risk", "tradeoff", "failure mode", "review", "score", "evaluate", "counterargument"])) {
    strengths.push("Uses critique or evaluation language.");
    score += 12;
  } else {
    gaps.push("Ask the model to critique, compare, score, or surface failure modes.");
  }

  if (hasAny(lowered, ["rewrite this prompt", "improve this prompt", "rewrite my prompt", "better prompt"])) {
    strengths.push("Uses AI to improve prompting itself.");
    score += 8;
  }

  score += Math.min(12, categories.length * 4);
  score = clamp(score, 0, 100);

  return {
    score,
    strengths: dedupe(strengths).slice(0, 4),
    gaps: dedupe(gaps).slice(0, 4),
    categories,
    rewrite: rewritePrompt(entry, categories),
  };
}

export function detectCategories(entry: CoachUsageEntry): string[] {
  const haystack = `${entry.prompt} ${entry.outcome ?? ""} ${entry.notes ?? ""} ${entry.tags.join(" ")}`.toLowerCase();
  const categories = new Set<string>();

  if (hasAny(haystack, ["eval", "rubric", "benchmark", "test set", "criteria"])) categories.add("eval_design");
  if (hasAny(haystack, ["harness", "judge", "golden", "scorecard", "threshold"])) categories.add("harness_building");
  if (hasAny(haystack, ["red-team", "attack", "abuse", "adversarial", "failure mode"])) categories.add("red_team");
  if (hasAny(haystack, ["memo", "brief", "leadership", "exec", "stakeholder"])) categories.add("leadership_brief");
  if (hasAny(haystack, ["tradeoff", "decision", "warn", "block", "policy"])) categories.add("decision_analysis");
  if (hasAny(haystack, ["reviewer", "legal", "policy", "eng", "alignment"])) categories.add("stakeholder_alignment");
  if (hasAny(haystack, ["summary", "summarize", "notes", "meeting"])) categories.add("summarization");
  if (hasAny(haystack, ["rewrite this prompt", "improve this prompt", "better prompt"])) categories.add("prompt_improvement");
  if (hasAny(haystack, ["plan", "roadmap", "outline", "steps"])) categories.add("planning");
  if (hasAny(haystack, ["implement", "fix", "debug", "code", "test", "ship"])) categories.add("implementation");

  return Array.from(categories);
}

export function scoreDay(entries: CoachUsageEntry[]): { scoreCard: ScoreCard; assessments: PromptAssessment[] } {
  const promptEntries = entries.filter((entry) => entry.source !== "auto");
  const assessments = promptEntries.map(assessPrompt);
  const amount = scoreAmount(entries);
  const quality = assessments.length === 0 ? 0 : Math.round(assessments.reduce((sum, item) => sum + item.score, 0) / assessments.length);
  const leverage = Math.round(amount * 0.45 + quality * 0.55);
  return {
    scoreCard: {
      amount,
      quality,
      leverage,
    },
    assessments,
  };
}

function assessAutoCapturedUsage(entry: CoachUsageEntry): PromptAssessment {
  const categories = detectCategories(entry);
  const score = entry.promptCaptureMode === "window_title" ? 58 : 50;

  return {
    score: clamp(score + Math.min(12, categories.length * 4), 0, 100),
    strengths: ["Usage was captured automatically from an active AI tool."],
    gaps: ["Prompt-level quality is not available unless you paste a prompt into Prompt Coach."],
    categories,
    rewrite: "Paste a real prompt into Prompt Coach if you want prompt-level feedback. Auto-capture is meant to track usage time and tool context, not inspect hidden prompt contents.",
  };
}

function assessSessionPreviewUsage(entry: CoachUsageEntry): PromptAssessment {
  const categories = detectCategories(entry);
  const lowered = `${entry.prompt} ${entry.notes ?? ""}`.toLowerCase();
  const strengths: string[] = ["Coach is reading a real Claude Code session preview instead of a guessed app-focus event."];
  const gaps: string[] = [];
  let score = 48;

  if (entry.prompt.split(/\s+/).length >= 8) {
    score += 8;
    strengths.push("Session has enough task context to classify the work.");
  } else {
    gaps.push("Task framing is too thin to judge whether the session is operating at a world-class bar.");
  }

  if (hasAny(lowered, ["memo", "rubric", "matrix", "checklist", "table", "brief"])) {
    score += 12;
    strengths.push("The session is oriented toward a concrete artifact.");
  } else {
    gaps.push("Push Claude toward a concrete artifact instead of open-ended help.");
  }

  if (hasAny(lowered, ["tradeoff", "counterargument", "failure mode", "criteria", "threshold", "severity"])) {
    score += 14;
    strengths.push("The session is using critique or evaluation language.");
  } else {
    gaps.push("Add critique language: criteria, failure modes, thresholds, or counterarguments.");
  }

  if (hasAny(lowered, ["harness", "eval", "benchmark", "golden", "judge"])) {
    score += 10;
    strengths.push("The session is pushing toward reusable evaluation infrastructure.");
  }

  return {
    score: clamp(score + Math.min(12, categories.length * 4), 0, 100),
    strengths: dedupe(strengths).slice(0, 4),
    gaps: dedupe(gaps).slice(0, 4),
    categories,
    rewrite:
      "Next turn: ask for a concrete artifact, explicit decision criteria, and the strongest failure mode or reviewer objection before accepting the answer.",
  };
}

export function extractFocusTerms(entries: CoachUsageEntry[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const matches = entry.prompt.toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
    for (const token of matches) {
      if (stopwords.has(token)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function scoreAmount(entries: CoachUsageEntry[]) {
  if (entries.length === 0) return 0;
  const totalMinutes = entries.reduce((sum, entry) => sum + Math.max(0, entry.minutes), 0);
  const categories = new Set(entries.flatMap((entry) => detectCategories(entry)));
  const interactionComponent = Math.min(55, Math.round((55 * entries.length) / 8));
  const minuteComponent = Math.min(35, Math.round((35 * totalMinutes) / 90));
  const varietyComponent = Math.min(10, categories.size * 2);
  return clamp(interactionComponent + minuteComponent + varietyComponent, 0, 100);
}

function rewritePrompt(entry: CoachUsageEntry, categories: string[]) {
  const original = entry.prompt.trim();
  if (categories.includes("summarization")) {
    return [
      "Summarize the material below for AI risk work.",
      "",
      "Context:",
      "- Audience: [leadership / reviewers / partner team]",
      "- Goal: [decision prep / alignment / record of meeting]",
      "",
      "Task:",
      "1. Pull out the key decisions, risks, and open questions.",
      "2. Separate signal from background detail.",
      "3. End with recommended next actions.",
      "",
      "Output format: bullets under headings.",
    ].join("\n");
  }

  return [
    "Rewrite this task as a sharper AI-risk work prompt.",
    "",
    `Original request: ${original.slice(0, 140)}${original.length > 140 ? "..." : ""}`,
    "",
    "Use this structure:",
    "- Context and stakes",
    "- Exact deliverable",
    "- Decision criteria or failure modes",
    "- Audience",
    "- Output format",
    "- Self-critique before final answer",
  ].join("\n");
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
