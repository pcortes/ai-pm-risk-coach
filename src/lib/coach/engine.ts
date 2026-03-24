import { buildMemoryProfile } from "./profile";
import { scoreDay, detectCategories } from "./scoring";
import { buildSuggestionQueue } from "./templates";
import { getActiveContext } from "./active-context";
import { readActivitySamples, readUsageEntries, recordActivitySample, writeMemoryProfile } from "./storage";
import { ActivitySample, CoachSnapshot, CoachUsageEntry, DailySummary } from "./types";
import { localDateKey } from "./time";
import { syncAutomaticUsageCapture } from "./auto-capture";
import { discoverClaudeSessions } from "../monitor/claude-sessions";
import { buildSessionMonitorFromCoachedSessions } from "./session-intelligence";
import { syncClaudeSessionCapture } from "./session-capture";
import { applyLlmCoachAnalysis, getCachedLlmCoachAnalysis, shouldWarmLlmCoachAnalysis, warmLlmCoachAnalysis } from "./llm-coach";

export async function buildCoachSnapshot(now = new Date()): Promise<CoachSnapshot> {
  const [activeContext, monitoredSessions] = await Promise.all([getActiveContext(), discoverClaudeSessions(now)]);
  await recordActivitySample({
    timestamp: now.toISOString(),
    appName: activeContext.appName,
    windowTitle: activeContext.windowTitle,
    workMode: activeContext.workMode,
  });

  const sessionCapture = await syncClaudeSessionCapture(monitoredSessions, now);
  const autoCapture = await syncAutomaticUsageCapture(activeContext, now);
  const entries = await readUsageEntries();
  const combinedEntries = [...entries, ...sessionCapture.liveEntries];
  const activitySamples = await readActivitySamples();
  const todayKey = localDateKey(now);
  const todayEntries = combinedEntries.filter((entry) => localDateKey(entry.timestamp) === todayKey);
  const { scoreCard, assessments } = scoreDay(todayEntries);
  const memoryProfile = buildMemoryProfile(combinedEntries, activitySamples);
  await writeMemoryProfile(memoryProfile);

  const today: DailySummary = {
    date: todayKey,
    interactions: todayEntries.length,
    minutes: todayEntries.reduce((sum, entry) => sum + Math.max(0, entry.minutes), 0),
    qualitySignals: todayEntries.filter((entry) => entry.source !== "auto").length,
    topTools: topCounts(todayEntries.map((entry) => entry.tool)),
    topCategories: topCounts(todayEntries.flatMap((entry) => detectCategories(entry))),
    topTags: topCounts(todayEntries.flatMap((entry) => entry.tags)),
    scoreCard,
  };

  const llmInput = {
    activeContext,
    sessions: sessionCapture.activeSessions,
    today: {
      interactions: today.interactions,
      minutes: today.minutes,
      amount: today.scoreCard.amount,
      quality: today.scoreCard.quality,
      leverage: today.scoreCard.leverage,
    },
    memoryProfile,
    recentEntries: todayEntries.length > 0 ? todayEntries : combinedEntries.slice(-8),
  };
  const llmAnalysis = await getCachedLlmCoachAnalysis(llmInput);
  const shouldWarm = !llmAnalysis && (await shouldWarmLlmCoachAnalysis(llmInput));
  if (shouldWarm) {
    void warmLlmCoachAnalysis(llmInput);
  }

  const coached = applyLlmCoachAnalysis(sessionCapture.activeSessions, llmAnalysis);
  const sessionMonitor = buildSessionMonitorFromCoachedSessions(coached.sessions);
  const liveAdvice = coached.liveAdvice;
  const dailyCoach = coached.dailyCoach;
  const coachSource = llmAnalysis ? "claude_cached" : "fallback";
  const coachStatusNote = llmAnalysis
    ? "Using Claude-generated coaching from the local Claude Code CLI cache."
    : shouldWarm
      ? "Monitoring is live. Waiting for Claude Code to return a real coaching analysis in the background."
      : "Monitoring is live, but Claude-generated coaching is unavailable or in retry backoff.";

  const suggestionQueue = buildSuggestionQueue(
    activeContext.workMode,
    new Set(todayEntries.flatMap((entry) => detectCategories(entry))),
    memoryProfile.coachingPriorities,
    memoryProfile.opportunityGaps[0],
  );

  return {
    generatedAt: new Date().toISOString(),
    coachSource,
    coachStatusNote,
    activeContext,
    autoCapture,
    sessionMonitor,
    dailyCoach,
    today,
    benchmark: {
      amountDelta: today.scoreCard.amount - memoryProfile.trend.last7Amount,
      qualityDelta: today.scoreCard.quality - memoryProfile.trend.last7Quality,
      leverageDelta: today.scoreCard.leverage - memoryProfile.trend.last7Leverage,
    },
    memoryProfile,
    liveAdvice,
    suggestionQueue,
    latestEntries: todayEntries.slice(-5).reverse(),
  };
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));
}
