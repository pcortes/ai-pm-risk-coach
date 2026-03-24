import type { SessionStatus } from "../monitor/types";

export type UsageSource = "manual" | "auto";

export type PromptCaptureMode = "full_prompt" | "window_title" | "context_only" | "session_preview";

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
  source?: UsageSource;
  promptCaptureMode?: PromptCaptureMode;
  sessionId?: string | null;
  sessionProvider?: string | null;
  sessionStartedAt?: string | null;
  sessionEndedAt?: string | null;
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
  qualitySignals: number;
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

export interface DailyTrajectoryPoint {
  date: string;
  interactions: number;
  minutes: number;
  amount: number;
  quality: number;
  leverage: number;
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

export interface AutoUsageSession {
  startedAt: string;
  lastSeenAt: string;
  tool: string;
  appName: string | null;
  windowTitle: string | null;
  workMode: string;
  promptCaptureMode: PromptCaptureMode;
}

export interface AutoCaptureStatus {
  enabled: boolean;
  detectedTool: string | null;
  currentSessionMinutes: number;
  promptCaptureMode: PromptCaptureMode | null;
  lastAutoEntryAt: string | null;
  note: string;
}

export interface TrackedClaudeSessionState {
  trackingVersion: 2;
  id: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  repoName: string | null;
  workingDirectory: string;
  branch: string | null;
  taskTitle: string | null;
  taskDescription: string | null;
  lastUserMessage: string | null;
  lastAssistantText: string | null;
  lastToolNames: string[];
  workType: string;
  rigorSignals: string[];
  weaknessSignals: string[];
  status: SessionStatus;
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
  trajectory: DailyTrajectoryPoint[];
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

export interface DailyCoachBrief {
  headline: string;
  judgment: string;
  worldClassBar: string;
  mainGap: string;
  rightNow: string[];
  generally: string[];
  useCasesToTry: string[];
  promptIssues: string[];
  historicalPromptCoaching: string[];
}

export interface SessionCoachCue {
  priority: "critical" | "high" | "medium";
  title: string;
  evidence: string;
  action: string;
}

export interface CoachedSession {
  id: string;
  repoName: string | null;
  workingDirectory: string;
  branch: string | null;
  status: SessionStatus;
  lastActivity: string;
  startedAt: string | null;
  sessionMinutes: number;
  taskTitle: string | null;
  taskDescription: string | null;
  previewUser: string | null;
  previewAssistant: string | null;
  lastToolNames: string[];
  workType: string;
  coachingFocus: string;
  sophisticationScore: number;
  rigorSignals: string[];
  weaknessSignals: string[];
  diagnosis: string;
  nextBestMove: string;
  worldClassStandard: string;
  promptToSend: string;
  expectedUpgrade: string;
  worldClassMoves: string[];
  transcriptSource: "hook" | "fallback" | null;
}

export interface SessionMonitorSummary {
  enabled: boolean;
  note: string;
  activeCount: number;
  workingCount: number;
  waitingCount: number;
  erroredCount: number;
  trackedMinutes: number;
  cues: SessionCoachCue[];
  sessions: CoachedSession[];
}

export interface CoachSnapshot {
  generatedAt: string;
  activeContext: ActiveContext;
  autoCapture: AutoCaptureStatus;
  sessionMonitor: SessionMonitorSummary;
  dailyCoach: DailyCoachBrief;
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
