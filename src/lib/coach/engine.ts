import { buildMemoryProfile } from "./profile";
import { scoreDay, detectCategories } from "./scoring";
import { buildSuggestionQueue } from "./templates";
import { getActiveContext } from "./active-context";
import { readActivitySamples, readUsageEntries, recordActivitySample, writeMemoryProfile } from "./storage";
import { ActivitySample, CoachSnapshot, CoachUsageEntry, DailySummary } from "./types";
import { localDateKey } from "./time";
import { syncAutomaticUsageCapture } from "./auto-capture";
import { discoverClaudeSessions } from "../monitor/claude-sessions";
import { buildDailyCoachBrief, buildSessionMonitorFromCoachedSessions } from "./session-intelligence";
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

  const fallbackDailyCoach = buildDailyCoachBrief({
    sessions: sessionCapture.activeSessions,
    profile: memoryProfile,
    todayMinutes: today.minutes,
    todayInteractions: today.interactions,
  });

  const fallbackLiveAdvice = buildLiveAdvice({
    activeContext,
    autoCapture,
    sessionMonitor: buildSessionMonitorFromCoachedSessions(sessionCapture.activeSessions),
    activitySamples,
    todayEntries,
    assessments,
    profile: memoryProfile,
  });

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
  if (!llmAnalysis && (await shouldWarmLlmCoachAnalysis(llmInput))) {
    void warmLlmCoachAnalysis(llmInput);
  }

  const coached = applyLlmCoachAnalysis(sessionCapture.activeSessions, llmAnalysis);
  const sessionMonitor = buildSessionMonitorFromCoachedSessions(coached.sessions);
  const liveAdvice = llmAnalysis ? coached.liveAdvice : fallbackLiveAdvice;
  const dailyCoach = llmAnalysis ? coached.dailyCoach : fallbackDailyCoach;

  const suggestionQueue = buildSuggestionQueue(
    activeContext.workMode,
    new Set(todayEntries.flatMap((entry) => detectCategories(entry))),
    memoryProfile.coachingPriorities,
    memoryProfile.opportunityGaps[0],
  );

  return {
    generatedAt: new Date().toISOString(),
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

function buildLiveAdvice(input: {
  activeContext: CoachSnapshot["activeContext"];
  autoCapture: CoachSnapshot["autoCapture"];
  sessionMonitor: CoachSnapshot["sessionMonitor"];
  activitySamples: ActivitySample[];
  todayEntries: CoachUsageEntry[];
  assessments: ReturnType<typeof scoreDay>["assessments"];
  profile: CoachSnapshot["memoryProfile"];
}) {
  const advice: string[] = [];
  const focusSession = input.sessionMonitor.sessions.find(
    (session) => session.status !== "idle" || session.taskTitle || session.previewUser,
  );

  if (input.sessionMonitor.cues.length > 0) {
    advice.push(...input.sessionMonitor.cues.map((cue) => `${cue.title}: ${cue.action}`));
  } else {
    advice.push(input.activeContext.opportunity);
  }

  if (focusSession?.worldClassMoves[0]) {
    advice.push(`World-class move: ${focusSession.worldClassMoves[0]}`);
  } else {
    advice.push(input.autoCapture.note);
  }

  if (input.todayEntries.length === 0) {
    advice.push("No AI interactions logged yet today. Start with one structured prompt on your highest-stakes decision.");
  } else if (input.todayEntries.length < 3) {
    advice.push("You have some usage today, but not enough depth yet. Push one session into a reusable artifact, rubric, or decision packet.");
  }

  const weakPrompt = input.assessments.find((item) => item.score < 60);
  if (weakPrompt) {
    const mainGap = weakPrompt.gaps[0] ?? "add more structure";
    advice.push(`Your latest weaker prompt suggests a recurring issue: ${mainGap}`);
  }

  if (input.profile.opportunityGaps[0]) {
    advice.push(
      `Profile signal: you spend more time in ${input.profile.opportunityGaps[0].workMode} than your AI usage suggests. ${input.profile.opportunityGaps[0].advice}`,
    );
  }

  if (input.profile.coachingHypotheses[0]) {
    advice.push(`Learning over time: ${input.profile.coachingHypotheses[0].recommendation}`);
  } else if (input.profile.coachingPriorities.length > 0) {
    advice.push(`Longer-term coaching priority: ${input.profile.coachingPriorities[0]}`);
  }

  if (input.sessionMonitor.activeCount === 0 && input.activitySamples.length > 0 && input.todayEntries.length === 0) {
    advice.push("The coach is seeing work context, but today still lacks a real AI session. Start with a high-stakes decision, eval, or harness design pass.");
  }

  return Array.from(new Set(advice.filter(Boolean))).slice(0, 4);
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
