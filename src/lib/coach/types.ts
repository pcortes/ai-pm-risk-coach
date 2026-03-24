export interface CoachUsageEntry {
  timestamp: string;
  tool: string;
  prompt: string;
  response?: string | null;
  minutes: number;
  tags: string[];
  outcome?: string | null;
  notes?: string | null;
  contextAppName?: string | null;
  contextWindowTitle?: string | null;
  contextWorkMode?: string | null;
}

export interface PromptAssessment {
  score: number;
  strengths: string[];
  gaps: string[];
  categories: string[];
  rewrite: string;
}

export interface ScoreCard {
  amount: number;
  quality: number;
  leverage: number;
}

export interface DailySummary {
  date: string;
  interactions: number;
  minutes: number;
  topTools: { name: string; count: number }[];
  topCategories: { name: string; count: number }[];
  topTags: { name: string; count: number }[];
  scoreCard: ScoreCard;
}

export interface TrendSummary {
  last7Amount: number;
  prior7Amount: number;
  last7Quality: number;
  prior7Quality: number;
  last7Leverage: number;
  prior7Leverage: number;
}

export interface CountMetric {
  name: string;
  count: number;
}

export interface DistributionMetric extends CountMetric {
  percentage: number;
}

export interface ActivitySample {
  timestamp: string;
  appName: string | null;
  windowTitle: string | null;
  workMode: string;
}

export interface LearnedFact {
  label: string;
  value: string;
  evidence: string;
}

export interface BehavioralPattern {
  title: string;
  evidence: string;
}

export interface CoachingHypothesis {
  title: string;
  rationale: string;
  recommendation: string;
  confidence: "low" | "medium" | "high";
}

export interface OpportunityGap {
  workMode: string;
  observedShare: number;
  aiShare: number;
  advice: string;
}

export interface MemoryProfile {
  generatedAt: string;
  daysTracked: number;
  totalInteractions: number;
  avgDailyInteractions: number;
  avgDailyMinutes: number;
  topTools: CountMetric[];
  topCategories: CountMetric[];
  topObservedApps: CountMetric[];
  topObservedWorkModes: DistributionMetric[];
  recurringTopics: string[];
  strengths: string[];
  coachingPriorities: string[];
  archetype: string;
  summary: string;
  trend: TrendSummary;
  learnedFacts: LearnedFact[];
  behavioralPatterns: BehavioralPattern[];
  coachingHypotheses: CoachingHypothesis[];
  opportunityGaps: OpportunityGap[];
}

export interface ActiveContext {
  appName: string | null;
  windowTitle: string | null;
  workMode: string;
  opportunity: string;
}

export interface CoachSuggestion {
  title: string;
  why: string;
  action: string;
  prompt: string;
}

export interface CoachSnapshot {
  generatedAt: string;
  activeContext: ActiveContext;
  today: DailySummary;
  benchmark: {
    amountDelta: number;
    qualityDelta: number;
    leverageDelta: number;
  };
  memoryProfile: MemoryProfile;
  liveAdvice: string[];
  suggestionQueue: CoachSuggestion[];
  latestEntries: CoachUsageEntry[];
}
