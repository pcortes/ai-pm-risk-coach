import {
  ActivitySample,
  BehavioralPattern,
  CoachUsageEntry,
  CoachingHypothesis,
  CountMetric,
  DistributionMetric,
  LearnedFact,
  MemoryProfile,
  OpportunityGap,
} from "./types";
import { assessPrompt, detectCategories, extractFocusTerms, scoreDay } from "./scoring";

export function buildMemoryProfile(entries: CoachUsageEntry[], activitySamples: ActivitySample[]): MemoryProfile {
  const usageBuckets = bucketByDay(entries.map((entry) => ({ timestamp: entry.timestamp, value: entry })));
  const daysTracked = countTrackedDays(entries, activitySamples);
  const totalInteractions = entries.length;
  const avgDailyInteractions = daysTracked === 0 ? 0 : round1(totalInteractions / daysTracked);
  const avgDailyMinutes =
    daysTracked === 0 ? 0 : round1(entries.reduce((sum, entry) => sum + Math.max(0, entry.minutes), 0) / daysTracked);

  const assessments = entries.map(assessPrompt);
  const topTools = counter(entries.map((entry) => entry.tool));
  const topCategories = counter(entries.flatMap((entry) => detectCategories(entry)));
  const recurringTopics = extractFocusTerms(entries, 8);
  const strengths = counter(assessments.flatMap((item) => item.strengths)).map((item) => item.name);
  const gapCounts = counter(assessments.flatMap((item) => item.gaps));
  const coachingPriorities = gapCounts.slice(0, 4).map((item) => item.name);

  const recent7 = usageBuckets.slice(-7);
  const prior7 = usageBuckets.slice(-14, -7);
  const recentEntries = recent7.flatMap((bucket) => bucket.values);
  const priorEntries = prior7.flatMap((bucket) => bucket.values);
  const recentScores = scoreDay(recentEntries).scoreCard;
  const priorScores = scoreDay(priorEntries).scoreCard;

  const topObservedApps = counter(activitySamples.map((sample) => sample.appName ?? "Unknown"))
    .filter((item) => item.name !== "Unknown")
    .slice(0, 6);
  const topObservedWorkModes = distributionCounter(
    activitySamples
      .map((sample) => sample.workMode)
      .filter((value) => value && value !== "unknown"),
  );
  const usageContextModes = distributionCounter(entries.map(inferUsageMode).filter(Boolean) as string[]);
  const opportunityGaps = buildOpportunityGaps(topObservedWorkModes, usageContextModes);

  const categoryScores = averageScoresByCategory(entries, assessments);
  const strongestCategory = categoryScores[0];
  const weakestCategory = categoryScores[categoryScores.length - 1];
  const bestUsageWindow = detectBestUsageWindow(entries, activitySamples);

  const learnedFacts = buildLearnedFacts({
    topTools,
    topCategories,
    topObservedWorkModes,
    strongestCategory,
    bestUsageWindow,
    opportunityGaps,
  });

  const behavioralPatterns = buildBehavioralPatterns({
    topObservedWorkModes,
    topCategories,
    opportunityGaps,
    coachingPriorities,
    bestUsageWindow,
  });

  const coachingHypotheses = buildCoachingHypotheses({
    entries,
    activitySamples,
    coachingPriorities,
    strongestCategory,
    weakestCategory,
    opportunityGaps,
  });

  const archetype = inferArchetype(
    topCategories.map((item) => item.name),
    topObservedWorkModes.map((item) => item.name),
  );
  const summary = buildSummary({
    avgDailyInteractions,
    avgDailyMinutes,
    topCategories: topCategories.map((item) => item.name),
    recurringTopics,
    coachingPriorities,
    topObservedWorkModes,
    opportunityGaps,
  });

  return {
    generatedAt: new Date().toISOString(),
    daysTracked,
    totalInteractions,
    avgDailyInteractions,
    avgDailyMinutes,
    topTools,
    topCategories,
    topObservedApps,
    topObservedWorkModes,
    recurringTopics,
    strengths: strengths.slice(0, 4),
    coachingPriorities,
    archetype,
    summary,
    trend: {
      last7Amount: recentScores.amount,
      prior7Amount: priorScores.amount,
      last7Quality: recentScores.quality,
      prior7Quality: priorScores.quality,
      last7Leverage: recentScores.leverage,
      prior7Leverage: priorScores.leverage,
    },
    learnedFacts,
    behavioralPatterns,
    coachingHypotheses,
    opportunityGaps,
  };
}

function buildLearnedFacts(input: {
  topTools: CountMetric[];
  topCategories: CountMetric[];
  topObservedWorkModes: DistributionMetric[];
  strongestCategory?: { name: string; averageScore: number; count: number };
  bestUsageWindow: string | null;
  opportunityGaps: OpportunityGap[];
}): LearnedFact[] {
  const facts: LearnedFact[] = [];

  if (input.topTools[0]) {
    facts.push({
      label: "Primary AI tool",
      value: input.topTools[0].name,
      evidence: `${input.topTools[0].count} logged interactions`,
    });
  }

  if (input.topObservedWorkModes[0]) {
    facts.push({
      label: "Most observed context",
      value: input.topObservedWorkModes[0].name,
      evidence: `${input.topObservedWorkModes[0].percentage}% of monitored time`,
    });
  }

  if (input.strongestCategory) {
    facts.push({
      label: "Strongest AI motion",
      value: input.strongestCategory.name,
      evidence: `average prompt quality ${input.strongestCategory.averageScore} across ${input.strongestCategory.count} use(s)`,
    });
  } else if (input.topCategories[0]) {
    facts.push({
      label: "Most common AI work",
      value: input.topCategories[0].name,
      evidence: `${input.topCategories[0].count} logged use(s)`,
    });
  }

  if (input.bestUsageWindow) {
    facts.push({
      label: "Best usage window",
      value: input.bestUsageWindow,
      evidence: "highest concentration of AI use relative to monitored time",
    });
  }

  if (input.opportunityGaps[0]) {
    facts.push({
      label: "Largest missed opportunity",
      value: input.opportunityGaps[0].workMode,
      evidence: `${input.opportunityGaps[0].observedShare}% observed vs ${input.opportunityGaps[0].aiShare}% AI usage`,
    });
  }

  return facts.slice(0, 5);
}

function buildBehavioralPatterns(input: {
  topObservedWorkModes: DistributionMetric[];
  topCategories: CountMetric[];
  opportunityGaps: OpportunityGap[];
  coachingPriorities: string[];
  bestUsageWindow: string | null;
}): BehavioralPattern[] {
  const patterns: BehavioralPattern[] = [];

  const topObserved = input.topObservedWorkModes.slice(0, 2);
  if (topObserved.length > 0) {
    patterns.push({
      title: "Work clusters in a small number of contexts",
      evidence: topObserved.map((item) => `${item.name} ${item.percentage}%`).join(" | "),
    });
  }

  if (input.topCategories[0]) {
    patterns.push({
      title: "AI is used most often for a repeatable work type",
      evidence: `${input.topCategories[0].name} appears ${input.topCategories[0].count} time(s) in logged usage`,
    });
  }

  if (input.opportunityGaps[0]) {
    patterns.push({
      title: "AI adoption trails where monitored time is actually spent",
      evidence: `${input.opportunityGaps[0].workMode} shows the largest gap between observed work and AI use`,
    });
  }

  if (input.coachingPriorities[0]) {
    patterns.push({
      title: "Prompt quality has a persistent limiting factor",
      evidence: input.coachingPriorities[0],
    });
  }

  if (input.bestUsageWindow) {
    patterns.push({
      title: "AI leverage tends to concentrate in a repeatable daily window",
      evidence: input.bestUsageWindow,
    });
  }

  return patterns.slice(0, 4);
}

function buildCoachingHypotheses(input: {
  entries: CoachUsageEntry[];
  activitySamples: ActivitySample[];
  coachingPriorities: string[];
  strongestCategory?: { name: string; averageScore: number; count: number };
  weakestCategory?: { name: string; averageScore: number; count: number };
  opportunityGaps: OpportunityGap[];
}): CoachingHypothesis[] {
  const hypotheses: CoachingHypothesis[] = [];
  const confidence = inferConfidence(input.entries.length, input.activitySamples.length);

  if (input.opportunityGaps[0]) {
    hypotheses.push({
      title: `Instrument ${input.opportunityGaps[0].workMode} with AI much earlier`,
      rationale: `${input.opportunityGaps[0].observedShare}% of monitored time lands in this context, but only ${input.opportunityGaps[0].aiShare}% of logged AI use happens there.`,
      recommendation: input.opportunityGaps[0].advice,
      confidence,
    });
  }

  if (input.coachingPriorities[0]) {
    hypotheses.push({
      title: "Prompt structure is still capping output quality",
      rationale: input.coachingPriorities[0],
      recommendation: "Before sending the next prompt, force explicit context, deliverable, success criteria, and a self-critique pass.",
      confidence,
    });
  }

  if (input.strongestCategory && input.weakestCategory && input.strongestCategory.name !== input.weakestCategory.name) {
    hypotheses.push({
      title: `Transfer quality from ${input.strongestCategory.name} into ${input.weakestCategory.name}`,
      rationale: `${input.strongestCategory.name} averages ${input.strongestCategory.averageScore}, while ${input.weakestCategory.name} averages ${input.weakestCategory.averageScore}.`,
      recommendation: `Reuse the structure and critique style from stronger ${input.strongestCategory.name} prompts when working in ${input.weakestCategory.name}.`,
      confidence,
    });
  }

  if (input.entries.length === 0 && input.activitySamples.length > 0) {
    hypotheses.push({
      title: "The coach sees work happening but not enough AI interactions",
      rationale: `${input.activitySamples.length} passive activity samples are recorded, but there are no logged AI sessions yet.`,
      recommendation: "Start by logging one or two high-value prompts each day so the profile can learn from real outcomes.",
      confidence: "medium",
    });
  }

  return hypotheses.slice(0, 4);
}

function buildOpportunityGaps(observedModes: DistributionMetric[], usageModes: DistributionMetric[]): OpportunityGap[] {
  const usageMap = new Map(usageModes.map((item) => [item.name, item.percentage]));
  return observedModes
    .map((item) => ({
      workMode: item.name,
      observedShare: item.percentage,
      aiShare: usageMap.get(item.name) ?? 0,
      advice: adviceForWorkMode(item.name),
    }))
    .filter((item) => item.observedShare - item.aiShare >= 12)
    .sort((a, b) => b.observedShare - b.aiShare - (a.observedShare - a.aiShare))
    .slice(0, 4);
}

function detectBestUsageWindow(entries: CoachUsageEntry[], activitySamples: ActivitySample[]) {
  const usageByHour = countByHour(entries.map((entry) => entry.timestamp));
  const activityByHour = countByHour(activitySamples.map((sample) => sample.timestamp));

  let bestHour: number | null = null;
  let bestScore = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const usageCount = usageByHour.get(hour) ?? 0;
    const activityCount = activityByHour.get(hour) ?? 0;
    if (usageCount === 0) continue;

    const score = activityCount === 0 ? usageCount : usageCount / activityCount;
    if (score > bestScore) {
      bestScore = score;
      bestHour = hour;
    }
  }

  if (bestHour === null) return null;
  return `${formatHour(bestHour)}-${formatHour((bestHour + 2) % 24)}`;
}

function averageScoresByCategory(entries: CoachUsageEntry[], assessments: ReturnType<typeof assessPrompt>[]) {
  const totals = new Map<string, { total: number; count: number }>();
  entries.forEach((entry, index) => {
    const categories = assessments[index]?.categories ?? detectCategories(entry);
    const score = assessments[index]?.score ?? 0;
    for (const category of categories) {
      const current = totals.get(category) ?? { total: 0, count: 0 };
      totals.set(category, { total: current.total + score, count: current.count + 1 });
    }
  });

  return Array.from(totals.entries())
    .map(([name, value]) => ({
      name,
      count: value.count,
      averageScore: Math.round(value.total / value.count),
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

function bucketByDay<T>(items: { timestamp: string; value: T }[]) {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const day = item.timestamp.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), item.value]);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, values]) => ({ day, values }));
}

function countTrackedDays(entries: CoachUsageEntry[], activitySamples: ActivitySample[]) {
  const days = new Set<string>();
  for (const entry of entries) {
    days.add(entry.timestamp.slice(0, 10));
  }
  for (const sample of activitySamples) {
    days.add(sample.timestamp.slice(0, 10));
  }
  return days.size;
}

function counter(values: string[], limit = 6): CountMetric[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function distributionCounter(values: string[], limit = 6): DistributionMetric[] {
  const counts = counter(values, limit * 2);
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  return counts.slice(0, limit).map((item) => ({
    ...item,
    percentage: total === 0 ? 0 : Math.round((item.count / total) * 100),
  }));
}

function countByHour(timestamps: string[]) {
  const counts = new Map<number, number>();
  for (const timestamp of timestamps) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;
    const hour = date.getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  return counts;
}

function inferUsageMode(entry: CoachUsageEntry) {
  if (entry.contextWorkMode) return entry.contextWorkMode;

  const categories = detectCategories(entry);
  if (categories.includes("leadership_brief")) return "docs";
  if (categories.includes("summarization")) return "meeting";
  if (categories.includes("eval_design") || categories.includes("red_team")) return "research";
  return "general";
}

function inferArchetype(categories: string[], observedModes: string[]) {
  if (categories.includes("eval_design") && categories.includes("red_team")) return "Risk Systems Thinker";
  if (categories.includes("leadership_brief") && categories.includes("decision_analysis")) return "Decision Memo Operator";
  if (categories.includes("summarization") && categories.includes("planning")) return "Synthesis-First Operator";
  if (observedModes.includes("docs") && observedModes.includes("browser")) return "Cross-Functional AI Operator";
  return "Generalist AI PM";
}

function buildSummary(input: {
  avgDailyInteractions: number;
  avgDailyMinutes: number;
  topCategories: string[];
  recurringTopics: string[];
  coachingPriorities: string[];
  topObservedWorkModes: DistributionMetric[];
  opportunityGaps: OpportunityGap[];
}) {
  const categories = input.topCategories.slice(0, 2).join(", ") || "general AI work";
  const observedModes = input.topObservedWorkModes
    .slice(0, 2)
    .map((item) => `${item.name} (${item.percentage}%)`)
    .join(", ") || "general work";
  const topics = input.recurringTopics.slice(0, 3).join(", ") || "current work";
  const priority = input.coachingPriorities[0] ?? "raise prompt quality with stronger context and deliverables";
  const gap = input.opportunityGaps[0]
    ? `The biggest unrealized opportunity is in ${input.opportunityGaps[0].workMode}.`
    : "There is not enough history yet to identify a dominant missed-opportunity context.";

  return `This user spends most monitored time in ${observedModes}, uses AI most often for ${categories}, averages ${input.avgDailyInteractions} interactions and ${input.avgDailyMinutes} minutes per tracked day, and repeatedly focuses on ${topics}. The main coaching priority is to ${priority.toLowerCase()}. ${gap}`;
}

function adviceForWorkMode(workMode: string) {
  switch (workMode) {
    case "docs":
      return "Use AI earlier while drafting to build decision memos, tradeoff tables, and leadership-ready language.";
    case "browser":
      return "Convert reading into eval criteria, risk matrices, and action items instead of passive research.";
    case "meeting":
      return "Use AI right after meetings to extract decisions, blockers, and follow-up actions while context is fresh.";
    case "slack":
      return "Pressure-test sensitive messages with AI before sending cross-functional alignment updates.";
    case "slides":
      return "Use AI to compress arguments into sharper slide headlines, objections, and backup points.";
    case "research":
      return "Push AI beyond summarization into adversarial testing, rubrics, and structured critiques.";
    default:
      return "Introduce one more structured AI pass in this context instead of relying on ad hoc drafting.";
  }
}

function inferConfidence(entryCount: number, activityCount: number): "low" | "medium" | "high" {
  if (entryCount >= 20 && activityCount >= 40) return "high";
  if (entryCount >= 8 || activityCount >= 15) return "medium";
  return "low";
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  return `${String(normalized).padStart(2, "0")}:00`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
