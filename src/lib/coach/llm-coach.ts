import { spawn } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";
import { detectCategories } from "./scoring";
import type { ActiveContext, CoachUsageEntry, CoachedSession, DailyCoachBrief, MemoryProfile } from "./types";

const DATA_DIR = join(homedir(), ".ai-pm-risk-coach");
const CACHE_FILE = join(DATA_DIR, "llm-coach-cache.json");
const ERROR_RETRY_MS = 5 * 60 * 1000;
const CLAUDE_TIMEOUT_MS = 45 * 1000;
const inflightAnalyses = new Map<string, Promise<LlmCoachAnalysis | null>>();

interface LlmCoachSessionPatch {
  id: string;
  coachingFocus: string;
  diagnosis: string;
  nextBestMove: string;
  worldClassStandard: string;
  promptToSend: string;
  expectedUpgrade: string;
  worldClassMoves: string[];
}

export interface LlmCoachAnalysis {
  dailyCoach: DailyCoachBrief;
  liveAdvice: string[];
  sessions: LlmCoachSessionPatch[];
}

interface CacheRecord {
  fingerprint: string;
  generatedAt: string;
  status?: "success" | "error";
  analysis: LlmCoachAnalysis | null;
  errorMessage?: string | null;
}

interface ClaudeCliResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

export async function getCachedLlmCoachAnalysis(input: {
  activeContext: ActiveContext;
  sessions: CoachedSession[];
  today: { interactions: number; minutes: number; amount: number; quality: number; leverage: number };
  memoryProfile: MemoryProfile;
  recentEntries: CoachUsageEntry[];
}): Promise<LlmCoachAnalysis | null> {
  const { fingerprint } = buildPreparedInput(input);
  const cached = await readCache();
  if (cached && cached.fingerprint === fingerprint && cached.analysis) {
    return cached.analysis;
  }
  return null;
}

export async function shouldWarmLlmCoachAnalysis(input: {
  activeContext: ActiveContext;
  sessions: CoachedSession[];
  today: { interactions: number; minutes: number; amount: number; quality: number; leverage: number };
  memoryProfile: MemoryProfile;
  recentEntries: CoachUsageEntry[];
}) {
  const { fingerprint } = buildPreparedInput(input);
  const cached = await readCache();
  if (!cached || cached.fingerprint !== fingerprint) return true;
  if (cached.analysis) return false;
  if ((cached.status ?? "success") !== "error") return true;
  return Date.now() - Date.parse(cached.generatedAt) >= ERROR_RETRY_MS;
}

export function warmLlmCoachAnalysis(input: {
  activeContext: ActiveContext;
  sessions: CoachedSession[];
  today: { interactions: number; minutes: number; amount: number; quality: number; leverage: number };
  memoryProfile: MemoryProfile;
  recentEntries: CoachUsageEntry[];
}) {
  const prepared = buildPreparedInput(input);
  const existing = inflightAnalyses.get(prepared.fingerprint);
  if (existing) return existing;

  const task = generateLlmCoachAnalysis(prepared).finally(() => {
    inflightAnalyses.delete(prepared.fingerprint);
  });
  inflightAnalyses.set(prepared.fingerprint, task);
  return task;
}

async function generateLlmCoachAnalysis(prepared: PreparedLlmInput): Promise<LlmCoachAnalysis | null> {
  const cached = await readCache();
  if (cached && cached.fingerprint === prepared.fingerprint && cached.analysis) {
    return cached.analysis;
  }

  const prompt = buildCoachPrompt(prepared.payload);

  try {
    const result = await runClaudePrompt(prompt);
    const parsed = parseClaudeJson(result.stdout);
    await writeCache({
      fingerprint: prepared.fingerprint,
      generatedAt: new Date().toISOString(),
      status: "success",
      analysis: parsed,
      errorMessage: null,
    });
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Claude coach error";
    await writeCache({
      fingerprint: prepared.fingerprint,
      generatedAt: new Date().toISOString(),
      status: "error",
      analysis: null,
      errorMessage: message,
    });
    console.error("LLM coach failed:", message);
    return null;
  }
}

export function applyLlmCoachAnalysis(
  sessions: CoachedSession[],
  analysis: LlmCoachAnalysis | null,
): { sessions: CoachedSession[]; liveAdvice: string[]; dailyCoach: DailyCoachBrief } {
  if (!analysis) {
    return {
      sessions,
      liveAdvice: [
        "LLM coaching is unavailable right now, so the app cannot generate the world-class next moves for this snapshot.",
      ],
      dailyCoach: {
        headline: "LLM coaching unavailable.",
        judgment: "Session monitoring is live, but Claude did not return a coaching analysis for this snapshot.",
        worldClassBar:
          "When the Claude coaching call is available, this section should translate session evidence into next-best moves, prompt upgrades, and operating advice.",
        mainGap: "No LLM-generated coach output was returned.",
        rightNow: ["Retry the snapshot after Claude CLI is available again."],
        generally: ["Keep the monitor running so the coach has better evidence when Claude comes back."],
        useCasesToTry: ["No LLM-generated use cases available right now."],
        promptIssues: ["No LLM-generated prompt critique available right now."],
        historicalPromptCoaching: ["No LLM-generated cross-session prompt coaching available right now."],
      },
    };
  }

  const patchById = new Map(analysis.sessions.map((session) => [session.id, session]));
  const mergedSessions = sessions.map((session) => {
    const patch = patchById.get(session.id);
    if (!patch) return session;
    return {
      ...session,
      coachingFocus: patch.coachingFocus,
      diagnosis: patch.diagnosis,
      nextBestMove: patch.nextBestMove,
      worldClassStandard: patch.worldClassStandard,
      promptToSend: patch.promptToSend,
      expectedUpgrade: patch.expectedUpgrade,
      worldClassMoves: patch.worldClassMoves,
    };
  });

  return {
    sessions: mergedSessions,
    liveAdvice: analysis.liveAdvice,
    dailyCoach: analysis.dailyCoach,
  };
}

function buildAnalysisPayload(input: {
  activeContext: ActiveContext;
  sessions: CoachedSession[];
  today: { interactions: number; minutes: number; amount: number; quality: number; leverage: number };
  memoryProfile: MemoryProfile;
  recentEntries: CoachUsageEntry[];
}) {
  return {
    activeContext: input.activeContext,
    today: input.today,
    trajectory: input.memoryProfile.trajectory.slice(-14),
    memoryProfile: {
      summary: input.memoryProfile.summary,
      archetype: input.memoryProfile.archetype,
      strengths: input.memoryProfile.strengths,
      coachingPriorities: input.memoryProfile.coachingPriorities,
      topObservedWorkModes: input.memoryProfile.topObservedWorkModes,
      topTools: input.memoryProfile.topTools,
      topCategories: input.memoryProfile.topCategories,
      opportunityGaps: input.memoryProfile.opportunityGaps,
      coachingHypotheses: input.memoryProfile.coachingHypotheses,
      learnedFacts: input.memoryProfile.learnedFacts,
    },
    recentUsageExamples: input.recentEntries.slice(-8).reverse().map((entry) => ({
      timestamp: entry.timestamp,
      tool: entry.tool,
      minutes: entry.minutes,
      prompt: truncate(entry.prompt, 320),
      response: truncate(entry.response ?? "", 220),
      notes: truncate(entry.notes ?? "", 220),
      outcome: truncate(entry.outcome ?? "", 160),
      categories: detectCategories(entry),
      contextWorkMode: entry.contextWorkMode,
      promptCaptureMode: entry.promptCaptureMode,
      sessionProvider: entry.sessionProvider,
    })),
    sessions: input.sessions
      .slice()
      .sort((left, right) => Date.parse(right.lastActivity) - Date.parse(left.lastActivity))
      .slice(0, 10)
      .map((session) => ({
        id: session.id,
        repoName: session.repoName,
        branch: session.branch,
        status: session.status,
        taskTitle: truncate(session.taskTitle, 180),
        taskDescription: truncate(session.taskDescription, 260),
        previewUser: truncate(session.previewUser, 700),
        previewAssistant: truncate(session.previewAssistant, 900),
        lastToolNames: session.lastToolNames,
        sessionMinutes: session.sessionMinutes,
        lastActivity: session.lastActivity,
        workType: session.workType,
        sophisticationScore: session.sophisticationScore,
        rigorSignals: session.rigorSignals,
        weaknessSignals: session.weaknessSignals,
        transcriptSource: session.transcriptSource,
      })),
  };
}

interface PreparedLlmInput {
  fingerprint: string;
  payload: ReturnType<typeof buildAnalysisPayload>;
}

function buildPreparedInput(input: {
  activeContext: ActiveContext;
  sessions: CoachedSession[];
  today: { interactions: number; minutes: number; amount: number; quality: number; leverage: number };
  memoryProfile: MemoryProfile;
  recentEntries: CoachUsageEntry[];
}): PreparedLlmInput {
  const payload = buildAnalysisPayload(input);
  return {
    payload,
    fingerprint: sha1(JSON.stringify(payload)),
  };
}

function buildCoachPrompt(payload: ReturnType<typeof buildAnalysisPayload>) {
  return [
    "You are a world-class AI-native PM and Claude Code coach.",
    "",
    "Your job is to coach a single operator from real session evidence and long-term usage memory.",
    "Do not give generic advice.",
    "Do not repeat abstract lines like 'ask for a concrete artifact' unless you make it concrete to the actual session.",
    "Be specific about docs, emails, PM writing, executive tone, human voice, planning, testing, evals, verification, orchestration, and coding when relevant.",
    "Use the user's memory/profile to distinguish RIGHT NOW coaching from GENERALLY coaching.",
    "The operator wants to become a world-class AI-native PM in a high-stakes risk organization.",
    "Your advice should read like a mentor sitting next to them all day, not a dashboard caption.",
    "",
    "Return JSON only with this exact shape:",
    '{"dailyCoach":{"headline":"","judgment":"","worldClassBar":"","mainGap":"","rightNow":[""],"generally":[""],"useCasesToTry":[""],"promptIssues":[""],"historicalPromptCoaching":[""]},"liveAdvice":[""],"sessions":[{"id":"","coachingFocus":"","diagnosis":"","nextBestMove":"","worldClassStandard":"","promptToSend":"","expectedUpgrade":"","worldClassMoves":[""]}]}',
    "",
    "Rules:",
    "- RIGHT NOW: immediate moves the user should take in current sessions this hour.",
    "- GENERALLY: habits and higher-level use cases to build over time.",
    "- Use memory and recent usage examples for overall workflow coaching across coding, writing, meeting prep, decision memos, and research.",
    "- promptIssues: concrete prompt weaknesses you see across sessions or memory, with specific fixes.",
    "- historicalPromptCoaching: critique the user's recurring prompt habits from recent and stored usage, including how to rewrite those habits at the pattern level.",
    "- If a session is estimating, coach on assumptions, ranges, critical path, and kill criteria.",
    "- If a session is getting feedback on docs, emails, or writing, coach on executive tone, human style, PM voice, reviewer readiness, and how to prompt for that.",
    "- If a session is coding, coach on planning, verification, evals, testing, rollback, and subagent usage when appropriate.",
    "- If a session involves meeting prep, stakeholder alignment, or reviewer feedback, coach on decision framing, tradeoffs, objections, voice, and crisp executive communication.",
    "- If a session has a 'done' or 'updated' style assistant response, coach on proof, acceptance criteria, residual risk, and requirement coverage.",
    "- If you infer a pattern from memory rather than direct transcript text, say 'pattern suggests' or equivalent instead of overstating certainty.",
    "- Every session entry must include an exact promptToSend that the operator can paste next.",
    "- Make each session's promptToSend tailored to that exact session. Avoid repeated prompts across sessions.",
    "- World-class advice should feel like a mentor or chief of staff, not a dashboard label.",
    "",
    "Context JSON:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseClaudeJson(stdout: string): LlmCoachAnalysis {
  if (!stdout.trim()) {
    throw new Error("Claude coach returned empty output");
  }

  const outer = JSON.parse(stdout) as { result?: string; is_error?: boolean };
  if (outer.is_error) {
    throw new Error(outer.result ?? "Claude coach returned an error");
  }
  const raw = outer.result ?? stdout;
  const cleaned = stripCodeFence(raw.trim());
  const jsonText = extractJson(cleaned);
  return JSON.parse(jsonText) as LlmCoachAnalysis;
}

async function runClaudePrompt(prompt: string): Promise<ClaudeCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      ["--print", "--output-format", "json", "--max-turns", "1", "--", prompt],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error("Claude coach timed out"));
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr, code, signal });
    });
  });
}

function stripCodeFence(text: string) {
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function extractJson(text: string) {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("Claude coach did not return JSON");
  }
  return text.slice(first, last + 1);
}

async function readCache(): Promise<CacheRecord | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    return JSON.parse(raw) as CacheRecord;
  } catch {
    return null;
  }
}

async function writeCache(record: CacheRecord) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(record, null, 2), "utf8");
}

function sha1(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function truncate(value: string | null | undefined, max: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
