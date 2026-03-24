import type { ClaudeSession } from "../monitor/types";
import type { CoachedSession, DailyCoachBrief, MemoryProfile, SessionCoachCue, SessionMonitorSummary } from "./types";

const RECENT_SESSION_WINDOW_MS = 30 * 60 * 1000;

const WORK_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: "eval_harness", keywords: ["eval", "rubric", "benchmark", "harness", "judge", "grading", "golden", "test set"] },
  { type: "red_team", keywords: ["abuse", "misuse", "adversarial", "red team", "exploit", "attack", "failure mode"] },
  { type: "decision_memo", keywords: ["decision", "tradeoff", "recommendation", "options", "leadership", "memo", "brief"] },
  { type: "stakeholder_alignment", keywords: ["reviewer", "stakeholder", "alignment", "comms", "policy", "legal", "exec"] },
  { type: "research_synthesis", keywords: ["research", "synthesize", "compare", "analysis", "reading", "notes", "summary"] },
  { type: "implementation", keywords: ["implement", "build", "refactor", "code", "fix", "test", "debug", "ship"] },
];

interface CoachingProfile {
  focus: string;
  diagnosis: string;
  nextBestMove: string;
  worldClassStandard: string;
  promptToSend: string;
  expectedUpgrade: string;
  weaknessSignals: string[];
  secondaryMoves: string[];
}

export function buildSessionMonitor(sessions: ClaudeSession[]): SessionMonitorSummary {
  return buildSessionMonitorFromCoachedSessions(sessions.map(coachSession));
}

export function buildSessionMonitorFromCoachedSessions(coachedSessions: CoachedSession[]): SessionMonitorSummary {
  const now = Date.now();
  const cues = dedupeCues(coachedSessions.flatMap((session) => buildCoachCues(session, now)).sort(byCuePriority)).slice(0, 6);

  return {
    enabled: true,
    note:
      coachedSessions.length > 0
        ? "Claude Code monitoring is using live CLI transcripts and hook events. Session minutes are tracked from when the coach attaches, not backfilled from old terminal age."
        : "No live Claude Code sessions detected right now. The monitor is reading ~/.claude/projects and ~/.claude-control/events.",
    activeCount: coachedSessions.length,
    workingCount: coachedSessions.filter((session) => session.status === "working").length,
    waitingCount: coachedSessions.filter((session) => session.status === "waiting").length,
    erroredCount: coachedSessions.filter((session) => session.status === "errored").length,
    trackedMinutes: coachedSessions.reduce((sum, session) => sum + session.sessionMinutes, 0),
    cues,
    sessions: coachedSessions,
  };
}

export function buildDailyCoachBrief(input: {
  sessions: CoachedSession[];
  profile: MemoryProfile;
  todayMinutes: number;
  todayInteractions: number;
}): DailyCoachBrief {
  const sessions = input.sessions;
  const focusCounts = topCounts(sessions.map((session) => session.coachingFocus));
  const topFocus = focusCounts[0]?.name ?? "general operator coaching";
  const completionSession = sessions.find((session) => session.coachingFocus === "Completion Proof");
  const estimationSession = sessions.find((session) => session.coachingFocus === "Estimate Review");
  const readinessSession = sessions.find((session) => session.coachingFocus === "Readiness Decision");
  const researchSession = sessions.find((session) => session.coachingFocus === "Research To Decision");
  const orchestrationSession = sessions.find((session) => session.coachingFocus === "Orchestration Design");
  const idleCount = sessions.filter((session) => session.status === "idle").length;

  const headline =
    idleCount >= 5
      ? "Breadth is outpacing closure."
      : input.todayInteractions >= 6
        ? "Usage is solid, but judgment quality is still the bottleneck."
        : "You have room to push AI into higher-value decisions today.";

  const judgment =
    idleCount >= 5
      ? `You have ${sessions.length} Claude Code sessions open, but too many of them are ending in answers or status language instead of proof packets, decision memos, or reusable systems.`
      : `You are using AI consistently, but the day still leans toward execution help over reviewer-grade challenge and decision support.`;

  const rightNow: string[] = [];
  if (completionSession) {
    rightNow.push(
      `Completion loop: take "${labelSession(completionSession)}" and demand a proof packet before you trust the "done" claim.`,
    );
  }
  if (estimationSession) {
    rightNow.push(
      `Estimate loop: turn "${labelSession(estimationSession)}" into assumptions, ranges, critical path, and what could double the timeline.`,
    );
  }
  if (readinessSession) {
    rightNow.push(
      `Decision loop: convert "${labelSession(readinessSession)}" from explanation into blocker / non-blocker / mitigation / recommendation.`,
    );
  }
  if (researchSession) {
    rightNow.push(
      `Research loop: force "${labelSession(researchSession)}" into claims, evidence quality, uncertainty, decision impact, and next experiment.`,
    );
  }
  if (orchestrationSession) {
    rightNow.push(
      `Orchestration loop: restructure "${labelSession(orchestrationSession)}" into workstreams, artifacts, rubric, merge criteria, and stop conditions.`,
    );
  }
  if (rightNow.length === 0) {
    rightNow.push("Close one open Claude thread into a review-ready artifact before you open another session.");
  }

  const generally = [
    "Use AI less for broad asks and more for decision-ready artifacts: proof packets, decision memos, eval plans, and risk matrices.",
    "Whenever Claude answers a high-stakes question, ask what evidence would reverse the recommendation or block shipment.",
    "End more sessions with reusable systems: checklist, rubric, verification loop, or merge protocol.",
  ];

  const useCasesToTry = [
    "Before any estimate: ask Claude for assumptions, confidence ranges, critical path, and kill criteria.",
    "Before accepting 'done': ask for requirement coverage, evidence, unresolved gaps, and residual risk.",
    "During research: ask for claim-by-claim evidence quality and what facts would actually change the decision.",
    "For big multi-agent work: ask for explicit workstreams, owner, artifact, evaluation rubric, and merge rules.",
  ];

  if (!input.profile.topCategories.some((metric) => metric.name === "eval_design" || metric.name === "harness_building")) {
    useCasesToTry.unshift("Before major product or risk decisions: use Claude to draft the eval plan, rubric, and adversarial cases.");
  }

  const promptIssues = dedupe([
    "Too many prompts ask for answers, not proof or decision structure.",
    "Prompts rarely require reversal criteria, reviewer objections, or acceptance bars.",
    input.profile.coachingPriorities[0] ?? null,
  ]).slice(0, 4);

  return {
    headline,
    judgment,
    worldClassBar:
      "World-class operators move from question to artifact, answer to proof, synthesis to decision, and one-off help to reusable system.",
    mainGap: `Today's pattern is ${idleCount >= 5 ? "breadth over closure" : "usage over rigor"}. The dominant coaching theme is ${topFocus.toLowerCase()}.`,
    rightNow: rightNow.slice(0, 4),
    generally,
    useCasesToTry: useCasesToTry.slice(0, 4),
    promptIssues,
    historicalPromptCoaching: [
      "Across recent prompts, the recurring issue is asking for answers before defining the decision, reviewer, or proof bar.",
      "Historical pattern: prompts often name the task but not the audience, success criteria, or what would count as a bad answer.",
      "Rewrite the pattern, not just one prompt: include context, exact deliverable, decision criteria, strongest objection, and a required artifact every time.",
    ],
  };
}

export function coachSession(session: ClaudeSession): CoachedSession {
  const workType = detectWorkType(session);
  const rigorSignals = detectRigorSignals(session, workType);
  const baseWeaknessSignals = detectWeaknessSignals(session, workType, rigorSignals);
  const profile = deriveCoachingProfile(session, workType);
  const weaknessSignals = normalizeWeaknessSignals(baseWeaknessSignals, profile.weaknessSignals);
  const worldClassMoves = dedupe([profile.nextBestMove, ...profile.secondaryMoves]).slice(0, 3);

  return {
    id: session.id,
    repoName: session.repoName,
    workingDirectory: session.workingDirectory,
    branch: session.branch,
    status: session.status,
    lastActivity: session.lastActivity,
    startedAt: session.startedAt,
    sessionMinutes: session.sessionMinutes,
    taskTitle: session.taskSummary?.title ?? summarizeUserIntent(session),
    taskDescription: session.taskSummary?.description ?? null,
    previewUser: session.preview.lastUserMessage,
    previewAssistant: session.preview.lastAssistantText,
    lastToolNames: session.preview.lastTools.map((tool) => tool.name),
    workType,
    coachingFocus: profile.focus,
    sophisticationScore: scoreSophistication(session, workType, rigorSignals, weaknessSignals),
    rigorSignals,
    weaknessSignals,
    diagnosis: profile.diagnosis,
    nextBestMove: profile.nextBestMove,
    worldClassStandard: profile.worldClassStandard,
    promptToSend: profile.promptToSend,
    expectedUpgrade: profile.expectedUpgrade,
    worldClassMoves,
    transcriptSource: session.transcriptSource,
  };
}

export function detectWorkType(session: ClaudeSession): string {
  const haystack = getSessionText(session);
  for (const entry of WORK_TYPE_KEYWORDS) {
    if (entry.keywords.some((keyword) => haystack.includes(keyword))) {
      return entry.type;
    }
  }
  return session.preview.lastTools.some((tool) => ["Edit", "Write", "Bash"].includes(tool.name)) ? "implementation" : "general";
}

function detectRigorSignals(session: ClaudeSession, workType: string): string[] {
  const haystack = getSessionText(session);
  const signals: string[] = [];

  if (session.taskSummary?.title) signals.push("clear task framing");
  if (hasAny(haystack, ["rubric", "criteria", "benchmark", "score", "threshold", "severity"])) signals.push("explicit evaluation criteria");
  if (hasAny(haystack, ["counterargument", "tradeoff", "objection", "failure mode", "what would change"])) signals.push("critique-first reasoning");
  if (hasAny(haystack, ["table", "memo", "brief", "checklist", "matrix", "packet"])) signals.push("artifact-oriented prompting");
  if (session.preview.lastTools.some((tool) => tool.name === "Agent")) signals.push("parallel agent usage");
  if (session.preview.lastTools.some((tool) => ["Read", "Grep", "Glob"].includes(tool.name))) signals.push("evidence gathering");
  if (session.preview.lastTools.some((tool) => ["Edit", "Write", "Bash"].includes(tool.name))) signals.push("execution through tools");
  if (workType === "eval_harness") signals.push("harness-oriented task selection");

  return dedupe(signals);
}

function detectWeaknessSignals(session: ClaudeSession, workType: string, rigorSignals: string[]): string[] {
  const haystack = getSessionText(session);
  const weaknesses: string[] = [];

  if (!hasAny(haystack, ["table", "memo", "brief", "checklist", "matrix", "rubric", "packet"])) {
    weaknesses.push("no explicit output artifact");
  }

  if ((workType === "decision_memo" || workType === "stakeholder_alignment") && !hasAny(haystack, ["counterargument", "objection", "what would change", "tradeoff", "criteria"])) {
    weaknesses.push("decision framing lacks reviewer-grade challenge");
  }

  if ((workType === "eval_harness" || workType === "red_team") && !hasAny(haystack, ["pass/fail", "threshold", "severity", "likelihood", "ranking"])) {
    weaknesses.push("risk work is not yet tied to a scoring frame");
  }

  if (workType === "research_synthesis" && !hasAny(haystack, ["evidence", "source quality", "confidence", "uncertainty"])) {
    weaknesses.push("research is not being converted into evidence quality judgments");
  }

  if (session.status === "waiting" && !hasAny(haystack, ["constraints", "out of scope", "acceptance", "success"])) {
    weaknesses.push("Claude is waiting without a crisp decision boundary");
  }

  if (session.preview.lastTools.some((tool) => tool.warnings.length > 0) && !rigorSignals.includes("explicit evaluation criteria")) {
    weaknesses.push("high-trust tool actions lack an explicit verification bar");
  }

  return dedupe(weaknesses);
}

function deriveCoachingProfile(session: ClaudeSession, workType: string): CoachingProfile {
  const haystack = getSessionText(session);

  if (looksLikeCompletionVerification(session, haystack)) {
    return {
      focus: "Completion Proof",
      diagnosis: "Claude is claiming completion, but this thread still lacks requirement coverage and proof.",
      nextBestMove: "Do not accept the status update yet. Ask for a proof packet: requirement coverage, changed files, tests run, artifacts, unresolved gaps, and residual risk.",
      worldClassStandard: "World-class operators never close a thread on 'done' language alone; they close it on evidence.",
      promptToSend:
        "Prove this is actually done. Give me: 1) requirement-by-requirement coverage, 2) exact changed files, 3) tests run and not run, 4) before/after artifacts, 5) what is still incomplete, and 6) residual risks before I trust the completion claim.",
      expectedUpgrade: "You will know whether the work is truly complete, what remains unverified, and what could still bite you in review or production.",
      weaknessSignals: ["completion claim lacks proof and requirement coverage"],
      secondaryMoves: [
        "If this is doc or spec work, ask Claude to map every change back to the original request and call out anything still missing.",
        "If no proof artifact exists, ask Claude what the smallest verification step is that would justify calling this done.",
      ],
    };
  }

  if (looksLikeEstimation(session, haystack)) {
    return {
      focus: "Estimate Review",
      diagnosis: "This session is giving you an answer about timeline or cost, but not an estimate system you can operate from.",
      nextBestMove: "Force Claude to break the estimate into assumptions, staffing, critical path, confidence ranges, and what could cut or double the timeline.",
      worldClassStandard: "World-class operators do not accept a smooth narrative estimate; they demand assumptions, uncertainty, and decision gates.",
      promptToSend:
        "Turn this into a decision-grade estimate. Give me: 1) workstreams, 2) assumptions by stream, 3) best / expected / worst-case timelines, 4) critical path, 5) what could double the timeline, 6) what could cut it in half, 7) staffing options, and 8) kill criteria that would change the recommendation.",
      expectedUpgrade: "You will know what actually drives schedule risk and which assumptions are worth challenging before you commit.",
      weaknessSignals: ["estimate lacks assumptions, uncertainty bands, and kill criteria"],
      secondaryMoves: [
        "Ask Claude to separate fixed constraints from assumptions so you know which parts of the estimate are negotiable.",
        "Force a recommendation with reversal conditions: what evidence would make you choose the opposite timeline or staffing plan?",
      ],
    };
  }

  if (looksLikeReadinessDecision(session, haystack)) {
    return {
      focus: "Readiness Decision",
      diagnosis: "You are in a readiness or go/no-go thread, but the session is still explanatory instead of decision-ready.",
      nextBestMove: "Convert this into blocker / non-blocker / mitigation / recommendation, not just an explanation of the issue.",
      worldClassStandard: "World-class operators turn launch questions into decision memos with severity, user impact, mitigation, and explicit sign-off criteria.",
      promptToSend:
        "Turn this into a go/no-go decision memo. Give me: 1) issue summary, 2) severity and user impact, 3) blocker vs non-blocker call, 4) mitigation options, 5) evidence required to ship safely, 6) strongest skeptical reviewer objection, and 7) recommendation.",
      expectedUpgrade: "You will leave this thread with a decision framework, not just background knowledge.",
      weaknessSignals: ["readiness discussion lacks blocker classification and recommendation"],
      secondaryMoves: [
        "Ask Claude what evidence would be enough to downgrade this from blocker to non-blocker.",
        "Force a counterargument from the most skeptical reliability or safety reviewer before you accept the recommendation.",
      ],
    };
  }

  if (looksLikeOrchestration(session, haystack)) {
    return {
      focus: "Orchestration Design",
      diagnosis: "You are asking for a large expert or subagent swarm, but the work is under-specified on merge protocol and evaluation.",
      nextBestMove: "Break the swarm into explicit workstreams with owner, artifact, rubric, merge criteria, and stop conditions.",
      worldClassStandard: "World-class operators do not ask for 'a world-class team' in the abstract; they define the workstreams, outputs, and quality gates the team must satisfy.",
      promptToSend:
        "Restructure this multi-agent run into an operating plan. For each workstream, give me: objective, owner type, exact artifact, evaluation rubric, merge criteria, stop conditions, and what a bad-but-plausible output would look like.",
      expectedUpgrade: "You will get a controllable multi-agent plan instead of broad parallel activity that is hard to evaluate or merge.",
      weaknessSignals: ["multi-agent prompt lacks workstream design and merge rubric"],
      secondaryMoves: [
        "Ask Claude which workstream should produce the final synthesis artifact and what evidence each feeder stream must provide.",
        "Ask for a lightweight review protocol so the swarm improves quality instead of just increasing output volume.",
      ],
    };
  }

  if (looksLikeDocumentationSystem(session, haystack)) {
    return {
      focus: "Documentation To Operating System",
      diagnosis: "This thread is producing documentation, but it is not yet forcing the rules, triggers, and checklists that would change future behavior.",
      nextBestMove: "Turn the doc into an operator checklist: when to use it, what to do differently, failure modes, and verification rules.",
      worldClassStandard: "World-class operators convert analysis and documentation into operating systems they can actually run, not static reference text.",
      promptToSend:
        "Convert this document into an operator playbook. Give me: 1) when to use it, 2) trigger conditions, 3) exact checklist, 4) common failure modes, 5) verification rules, and 6) what I should do differently in my next real session.",
      expectedUpgrade: "The output becomes something you can execute under pressure, not just read once and forget.",
      weaknessSignals: ["documentation output is not yet an operating checklist"],
      secondaryMoves: [
        "Ask Claude to trim anything that would not change operator behavior in the next session.",
        "End with a short field guide: what good looks like, what failure looks like, and what to check before shipping.",
      ],
    };
  }

  if (workType === "eval_harness" || workType === "red_team") {
    return {
      focus: workType === "eval_harness" ? "Eval Harness Design" : "Adversarial Test Design",
      diagnosis:
        workType === "eval_harness"
          ? "This session is pointed at evaluation work, but it still needs a reusable harness design with judges, thresholds, and failure taxonomy."
          : "This session is exploring risk or failure modes, but it still needs a reproducible adversarial test plan instead of one-off red-team ideas.",
      nextBestMove:
        workType === "eval_harness"
          ? "Turn this into a scored eval system: task slices, rubric, judges, thresholds, edge cases, and what would fail sign-off."
          : "Turn this into a red-team program: attack classes, severity model, test cases, pass/fail bars, and escalation rules.",
      worldClassStandard:
        workType === "eval_harness"
          ? "World-class AI risk PMs do not stop at good prompts; they build reusable harnesses that can pressure-test a decision repeatedly."
          : "World-class operators convert abstract risk concern into a repeatable adversarial testing system with severity and sign-off logic.",
      promptToSend:
        workType === "eval_harness"
          ? "Upgrade this into a reusable eval harness. Give me: 1) eval objectives, 2) scenario buckets, 3) pass/fail rubric, 4) judge instructions, 5) thresholds, 6) edge cases, 7) likely false positives/negatives, and 8) what evidence would block launch."
          : "Turn this into an adversarial test plan. Give me: 1) attack classes, 2) example prompts, 3) severity and likelihood model, 4) pass/fail criteria, 5) escalation triggers, 6) logging requirements, and 7) what would change the ship decision.",
      expectedUpgrade:
        workType === "eval_harness"
          ? "You will leave with a reusable evaluation instrument instead of a loose brainstorm."
          : "You will have a concrete red-team framework that can be rerun, reviewed, and tied to launch decisions.",
      weaknessSignals:
        workType === "eval_harness"
          ? ["eval work is not yet specified as a reusable harness with judges and thresholds"]
          : ["risk exploration is not yet structured into a reproducible adversarial test system"],
      secondaryMoves: [
        "Ask Claude which failure cases are most decision-changing so the harness focuses on real launch risk.",
        "Force a final section that explains what result would block launch, what result would allow shipping, and what remains ambiguous.",
      ],
    };
  }

  if (workType === "research_synthesis") {
    return {
      focus: "Research To Decision",
      diagnosis: "This session is still a research pile. The information has not been converted into evidence quality, implications, or a decision path.",
      nextBestMove: "Turn the research into a signal table: claim, evidence quality, uncertainty, decision impact, and next experiment.",
      worldClassStandard: "World-class operators use AI to turn research into decision leverage, not just larger notes.",
      promptToSend:
        "Convert this research into a decision instrument. For each major claim, give me: claim, evidence quality, uncertainty, decision impact, and next action. Then tell me which 3 unknowns would actually change the recommendation.",
      expectedUpgrade: "You will know what matters, what is weak, and what additional work would actually move the decision.",
      weaknessSignals: ["research is not yet converted into evidence quality and decision impact"],
      secondaryMoves: [
        "Ask Claude to write the decision memo that this research is supposed to support.",
        "Force the model to separate 'interesting' facts from 'decision-changing' facts.",
      ],
    };
  }

  if (workType === "implementation") {
    return {
      focus: "Verification Loop",
      diagnosis: "Claude is helping build, but the session is still weak on verification, rollback thinking, and reviewer-grade challenge.",
      nextBestMove: "Push the next turn into a verification loop: what changed, how to verify it, what could fail, and how to roll it back.",
      worldClassStandard: "World-class operators use AI as a systems engineer: every implementation pass ends with proof, rollback thinking, and explicit unresolved risk.",
      promptToSend:
        "Before we continue, turn this into a verification loop. Give me: 1) exact objective, 2) files or components touched, 3) verification steps, 4) expected outputs, 5) rollback plan, 6) unresolved risks, and 7) what a skeptical reviewer would still question.",
      expectedUpgrade: "You stop using Claude as a typist and start using it as an engineer that can justify and verify its work.",
      weaknessSignals: ["implementation thread lacks verification loop and reviewer challenge"],
      secondaryMoves: [
        "If the task branches, use one subagent for verification and another for counterarguments instead of keeping one long thread.",
        "Ask Claude what proof artifact would let you close the thread with confidence.",
      ],
    };
  }

  return {
    focus: "Prompt Framing",
    diagnosis: "The task is broad, but the quality bar is underspecified. Claude can help more than this if you define the deliverable and success bar.",
    nextBestMove: "Sharpen the ask into a concrete output with acceptance criteria, critique, and a decision purpose.",
    worldClassStandard: "World-class operators do not ask for vague help; they define what good looks like, what would fail review, and what artifact should come back.",
    promptToSend:
      "Rewrite this task into a world-class operator prompt. Include: context, exact deliverable, audience, success criteria, strongest counterargument, and what proof or artifact should come back.",
    expectedUpgrade: "The next assistant turn will be shaped around a real bar instead of generic helpfulness.",
    weaknessSignals: ["prompt is too broad and under-specified"],
    secondaryMoves: [
      "Ask Claude to state the strongest reviewer objection before giving the final answer.",
      "End the prompt with a required artifact: memo, table, rubric, checklist, or decision packet.",
    ],
  };
}

function buildCoachCues(session: CoachedSession, now: number): SessionCoachCue[] {
  const lastActivityMs = Date.parse(session.lastActivity);
  const recentlyActive = !Number.isNaN(lastActivityMs) && now - lastActivityMs <= RECENT_SESSION_WINDOW_MS;
  if (session.status === "idle" && !recentlyActive) {
    return [];
  }

  const evidenceBase = session.taskTitle ?? session.previewUser ?? session.repoName ?? "current Claude Code session";
  const cues: SessionCoachCue[] = [];

  if (session.status === "errored") {
    cues.push({
      priority: "critical",
      title: "Recover the broken session before widening scope",
      evidence: evidenceBase,
      action: "Use Claude to isolate the root cause, define the narrowest fix, and list the proof that the branch is stable again.",
    });
  }

  if (session.status === "waiting") {
    cues.push({
      priority: "critical",
      title: `${session.coachingFocus}: blocked on operator judgment`,
      evidence: session.previewAssistant ?? evidenceBase,
      action: session.nextBestMove,
    });
  }

  if (session.weaknessSignals[0]) {
    cues.push({
      priority: session.sophisticationScore < 60 ? "high" : "medium",
      title: session.coachingFocus,
      evidence: `${evidenceBase} · ${session.weaknessSignals[0]}`,
      action: session.nextBestMove,
    });
  }

  return cues;
}

function looksLikeEstimation(session: ClaudeSession, haystack: string) {
  return (
    hasAny(haystack, ["how long", "timeline", "estimate", "weeks", "months", "launch cost", "cost to build"]) ||
    /^how long\b/i.test(session.preview.lastUserMessage ?? "")
  );
}

function looksLikeCompletionVerification(session: ClaudeSession, haystack: string) {
  return (
    hasAny(haystack, ["did this get done", "what changed", "completed", "complete", "updated", "pushed"]) ||
    /^done[.!]/i.test(session.preview.lastAssistantText ?? "")
  );
}

function looksLikeReadinessDecision(session: ClaudeSession, haystack: string) {
  return (
    hasAny(haystack, ["ga ready", "prod ready", "production ready", "launch readiness", "healthz", "go/no-go", "blocker"]) ||
    hasAny(session.preview.lastUserMessage?.toLowerCase() ?? "", ["ga ready", "prod ready", "healthz"])
  );
}

function looksLikeOrchestration(session: ClaudeSession, haystack: string) {
  return (
    hasAny(haystack, ["subagent", "subagents", "assemble team", "world class team", "world class pm", "expert opus"]) ||
    session.preview.lastTools.some((tool) => tool.name === "Agent")
  );
}

function looksLikeDocumentationSystem(_session: ClaudeSession, haystack: string) {
  return hasAny(haystack, ["claude.md", "readme", "documentation", "directory", "playbook", "guide"]);
}

function scoreSophistication(
  session: ClaudeSession,
  workType: string,
  rigorSignals: string[],
  weaknessSignals: string[],
): number {
  let score = 34;
  score += Math.min(24, rigorSignals.length * 8);
  score += Math.min(16, session.preview.messageCount * 2);
  score += Math.min(10, session.preview.lastTools.length * 4);
  if (workType !== "general") score += 8;
  if (session.taskSummary?.description) score += 6;
  score -= weaknessSignals.length * 8;
  return clamp(score, 0, 100);
}

function normalizeWeaknessSignals(baseWeaknessSignals: string[], specificWeaknessSignals: string[]) {
  const specific = dedupe(specificWeaknessSignals);
  const base = dedupe(baseWeaknessSignals);
  if (specific.length > 0) {
    return dedupe([...specific, ...base.filter((value) => value !== "no explicit output artifact")]).slice(0, 4);
  }
  return base.slice(0, 4);
}

function summarizeUserIntent(session: ClaudeSession) {
  return session.preview.lastUserMessage?.split("\n")[0].trim() ?? null;
}

function getSessionText(session: ClaudeSession) {
  return [
    session.taskSummary?.title,
    session.taskSummary?.description,
    session.preview.lastUserMessage,
    session.preview.lastAssistantText,
    ...session.preview.lastTools.map((tool) => `${tool.name} ${tool.input ?? ""} ${tool.description ?? ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function labelSession(session: CoachedSession) {
  return session.taskTitle ?? session.repoName ?? "this session";
}

function hasAny(text: string, needles: string[] | string) {
  const values = Array.isArray(needles) ? needles : [needles];
  return values.some((needle) => text.includes(needle));
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function byCuePriority(left: SessionCoachCue, right: SessionCoachCue) {
  return priorityWeight(right.priority) - priorityWeight(left.priority);
}

function priorityWeight(priority: SessionCoachCue["priority"]) {
  switch (priority) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "medium":
    default:
      return 1;
  }
}

function dedupeCues(cues: SessionCoachCue[]) {
  const seen = new Set<string>();
  return cues.filter((cue) => {
    const key = `${cue.title}|${cue.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function topCounts(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}
