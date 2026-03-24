"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CoachSnapshot, PromptAssessment } from "@/lib/coach/types";

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  });

const EMPTY_SESSION_MONITOR: CoachSnapshot["sessionMonitor"] = {
  enabled: false,
  note: "Claude Code monitor is still attaching.",
  activeCount: 0,
  workingCount: 0,
  waitingCount: 0,
  erroredCount: 0,
  trackedMinutes: 0,
  cues: [],
  sessions: [],
};

export default function Page() {
  const { data, error, isLoading } = useSWR<CoachSnapshot>("/api/coach", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const [draftPrompt, setDraftPrompt] = useState("");
  const [promptAssessment, setPromptAssessment] = useState<PromptAssessment | null>(null);
  const sessionMonitor = data?.sessionMonitor ?? EMPTY_SESSION_MONITOR;

  useEffect(() => {
    if (!draftPrompt.trim()) {
      setPromptAssessment(null);
      return;
    }

    const timeout = setTimeout(async () => {
      const response = await fetch("/api/prompt-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draftPrompt }),
      });

      if (!response.ok) return;
      const payload = (await response.json()) as PromptAssessment;
      setPromptAssessment(payload);
    }, 250);

    return () => clearTimeout(timeout);
  }, [draftPrompt]);

  return (
    <div className="space-y-6">
      <header className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(186,230,253,0.18),rgba(251,191,36,0.08),rgba(255,255,255,0.02))] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <p className="titlebar-no-drag mb-2 text-xs uppercase tracking-[0.3em] text-sky-200/70">AI PM Risk Coach</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-white">Personal AI leverage coach for high-stakes risk work</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
              Real-time context, prompt coaching, daily scoring, benchmark trends, and a cumulative memory profile that gets sharper as your local history grows.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
            <div>Refresh: every 5s</div>
            <div>Storage: <span className="font-mono text-zinc-100">~/.ai-pm-risk-coach</span></div>
          </div>
        </div>
      </header>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">Failed to load coach snapshot.</div>}
      {isLoading && !data && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">Loading coach...</div>}

      {data && (
        <>
          <section className="grid gap-4 lg:grid-cols-4">
            <MetricCard
              title="Amount"
              value={`${data.today.scoreCard.amount}`}
              caption={`Interactions ${data.today.interactions} · Minutes ${data.today.minutes}`}
              delta={data.benchmark.amountDelta}
            />
            <MetricCard
              title="Prompt Quality"
              value={`${data.today.scoreCard.quality}`}
              caption={`Prompt-scored interactions ${data.today.qualitySignals}`}
              delta={data.benchmark.qualityDelta}
            />
            <MetricCard
              title="Leverage"
              value={`${data.today.scoreCard.leverage}`}
              caption={`Compared to your trailing 7-day baseline`}
              delta={data.benchmark.leverageDelta}
            />
            <MetricCard
              title="Claude Code"
              value={`${sessionMonitor.activeCount} live`}
              caption={`Working ${sessionMonitor.workingCount} · Waiting ${sessionMonitor.waitingCount} · Minutes ${sessionMonitor.trackedMinutes}`}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
            <Panel title="Coach Brief" subtitle="RIGHT NOW and GENERAL coaching from live sessions plus long-term memory">
              <div className="rounded-[28px] border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(14,165,233,0.08),rgba(255,255,255,0.02))] p-5">
                <div className="text-xs uppercase tracking-[0.25em] text-emerald-200/70">Today&apos;s call</div>
                <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{data.dailyCoach.headline}</div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-200">{data.dailyCoach.judgment}</p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InfoBlock label="Main gap" value={data.dailyCoach.mainGap} />
                <InfoBlock label="World-class bar" value={data.dailyCoach.worldClassBar} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <ListBlock title="RIGHT NOW" items={data.dailyCoach.rightNow} empty="No immediate moves yet." />
                <ListBlock title="GENERALLY" items={data.dailyCoach.generally} empty="No broader coaching yet." />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <ListBlock title="Use Cases To Try" items={data.dailyCoach.useCasesToTry} empty="No workflow plays yet." />
                <ListBlock title="Prompt Issues" items={data.dailyCoach.promptIssues} empty="No cross-session prompt issues yet." />
              </div>

              <div className="mt-4">
                <ListBlock
                  title="Historical Prompt Coaching"
                  items={data.dailyCoach.historicalPromptCoaching}
                  empty="No historical prompt coaching yet."
                />
              </div>

              <div className="mt-4 space-y-3">
                <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Live advice</div>
                {data.liveAdvice.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm leading-6 text-zinc-200">
                    {item}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Expertise Trajectory" subtitle="Is usage becoming more world-class or just more frequent?">
              <TrajectoryChart data={data.memoryProfile.trajectory} />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InfoBlock label="Current archetype" value={data.memoryProfile.archetype} />
                <InfoBlock label="Days tracked" value={`${data.memoryProfile.daysTracked}`} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <InfoBlock label="Last 7 amount" value={`${data.memoryProfile.trend.last7Amount}`} />
                <InfoBlock label="Last 7 quality" value={`${data.memoryProfile.trend.last7Quality}`} />
                <InfoBlock label="Last 7 leverage" value={`${data.memoryProfile.trend.last7Leverage}`} />
              </div>
              <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-zinc-300">
                <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Why this matters</div>
                <p className="mt-3">
                  The goal is not to drive the line up with empty usage. The goal is to see whether prompting, decision quality,
                  and execution rigor are compounding into better leverage over time.
                </p>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel title="Live Context" subtitle="What the app sees right now">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Frontmost app" value={data.activeContext.appName ?? "Unknown"} />
                <InfoBlock label="Detected work mode" value={data.activeContext.workMode} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Auto capture" value={data.autoCapture.detectedTool ? `Tracking ${data.autoCapture.detectedTool}` : "Standing by"} />
                <InfoBlock label="Claude monitor" value={sessionMonitor.note} />
              </div>
              <InfoBlock label="Window title" value={data.activeContext.windowTitle ?? "Unavailable"} />
              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/8 p-4 text-sm leading-6 text-sky-100">
                {data.activeContext.opportunity}
              </div>
            </Panel>

            <Panel title="Memory Profile" subtitle="This is the cumulative local profile, not one-off chat advice">
              <p className="text-sm leading-6 text-zinc-300">{data.memoryProfile.summary}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Recurring topics" value={data.memoryProfile.recurringTopics.join(", ") || "Not enough history yet"} />
                <InfoBlock label="Coaching priorities" value={data.memoryProfile.coachingPriorities.join(" | ") || "No persistent weakness detected yet"} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <InfoBlock label="Top tools" value={formatCounts(data.memoryProfile.topTools)} />
                <InfoBlock label="Top AI work" value={formatCounts(data.memoryProfile.topCategories)} />
                <InfoBlock label="Known strengths" value={data.memoryProfile.strengths.join(" | ") || "Still learning"} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Observed contexts" value={formatDistributionCounts(data.memoryProfile.topObservedWorkModes) || "Not enough passive samples yet"} />
                <InfoBlock label="Observed apps" value={formatCounts(data.memoryProfile.topObservedApps) || "Not enough passive samples yet"} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <InfoBlock label="Last 7 amount" value={`${data.memoryProfile.trend.last7Amount}`} />
                <InfoBlock label="Last 7 quality" value={`${data.memoryProfile.trend.last7Quality}`} />
                <InfoBlock label="Last 7 leverage" value={`${data.memoryProfile.trend.last7Leverage}`} />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <ListBlock
                  title="Learned facts"
                  items={data.memoryProfile.learnedFacts.map((fact) => `${fact.label}: ${fact.value} (${fact.evidence})`)}
                  empty="The coach needs a bit more history before it can state stable facts."
                />
                <ListBlock
                  title="Behavior patterns"
                  items={data.memoryProfile.behavioralPatterns.map((pattern) => `${pattern.title}: ${pattern.evidence}`)}
                  empty="Behavior patterns will appear once the app sees repeated routines."
                />
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel title="Claude Code Sessions" subtitle="Live transcript-aware coaching from the actual CLI sessions">
              <div className="space-y-4">
                {sessionMonitor.sessions.length === 0 && (
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-zinc-300">
                    No live Claude Code sessions detected. The monitor is standing by on <span className="font-mono text-zinc-100">~/.claude/projects</span> and <span className="font-mono text-zinc-100">~/.claude-control/events</span>.
                  </div>
                )}
                {sessionMonitor.sessions.map((session) => (
                  <div key={session.id} className="rounded-[26px] border border-white/8 bg-white/4 p-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-lg font-medium text-white">{session.taskTitle ?? session.repoName ?? "Claude session"}</div>
                        <div className="mt-1 text-sm text-zinc-400">{session.repoName ?? session.workingDirectory}</div>
                      </div>
                      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusTone(session.status)}`}>
                        {session.status} · {session.sessionMinutes}m
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InfoBlock label="Work type" value={labelize(session.workType)} />
                      <InfoBlock label="Sophistication" value={`${session.sophisticationScore} / 100`} />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InfoBlock label="Coaching focus" value={session.coachingFocus} />
                      <InfoBlock label="Expected upgrade" value={session.expectedUpgrade} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-red-300/15 bg-red-300/6 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.25em] text-red-200/70">Diagnosis</div>
                      <div className="text-sm leading-6 text-red-50">{session.diagnosis}</div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-sky-300/20 bg-sky-300/8 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.25em] text-sky-200/70">Next best move</div>
                      <div className="text-sm leading-6 text-sky-50">{session.nextBestMove}</div>
                    </div>

                    <CopyablePrompt
                      label="Send this next"
                      value={session.promptToSend}
                    />

                    <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/8 p-4">
                      <div className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-200/70">World-class standard</div>
                      <div className="text-sm leading-6 text-emerald-50">{session.worldClassStandard}</div>
                      {session.worldClassMoves.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {session.worldClassMoves.map((move) => (
                            <div key={move} className="rounded-2xl border border-white/8 bg-black/15 px-3 py-2 text-sm leading-6 text-emerald-50">
                              {move}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <ListBlock title="Observed rigor" items={session.rigorSignals} empty="No strong rigor signals detected yet." />
                      <ListBlock title="Likely weaknesses" items={session.weaknessSignals} empty="No major weakness detected right now." />
                    </div>

                    {(session.previewUser || session.previewAssistant) && (
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <InfoBlock label="Latest user intent" value={session.previewUser ?? "Unavailable"} />
                        <InfoBlock label="Latest assistant turn" value={session.previewAssistant ?? "Unavailable"} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel title="Prompt Coach" subtitle="Optional second pass when you want to sharpen an important prompt before sending it">
                <textarea
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                  placeholder="Paste or draft your current prompt here..."
                  className="titlebar-no-drag min-h-[220px] w-full rounded-3xl border border-white/10 bg-black/35 px-5 py-4 text-sm leading-6 text-zinc-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
                />
                <div className="mt-4 grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
                      <div className="text-xs uppercase tracking-[0.25em] text-zinc-400">Live score</div>
                      <div className="mt-2 text-4xl font-semibold text-white">{promptAssessment?.score ?? "--"}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-zinc-300">
                      Categories: {promptAssessment?.categories.join(", ") || "none detected yet"}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <ListBlock title="Strengths" items={promptAssessment?.strengths ?? []} empty="No strengths detected yet." />
                    <ListBlock title="Gaps" items={promptAssessment?.gaps ?? []} empty="No obvious gaps detected." />
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4">
                  <div className="mb-2 text-xs uppercase tracking-[0.25em] text-amber-200/70">Suggested rewrite</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-amber-50">{promptAssessment?.rewrite ?? "Paste a prompt to see a stronger rewrite."}</pre>
                </div>
              </Panel>

              <Panel title="Learning Loop" subtitle="Persistent, local, and inspectable">
              <div className="space-y-4 text-sm leading-6 text-zinc-300">
                <p>
                  This app is no longer relying on app-focus guesses for Claude Code. It reads live CLI transcript previews and Claude hook events, then turns them into session-aware coaching, scoring, and memory.
                </p>
                <p>
                  Browser usage is intentionally not counted as AI usage. Dedicated AI apps can still be auto-tracked, but Claude Code is now monitored through the actual session substrate instead of frontmost-window detection.
                </p>
                <ListBlock
                  title="Current coaching hypotheses"
                  items={data.memoryProfile.coachingHypotheses.map(
                    (item) => `${item.title} [${item.confidence}]: ${item.recommendation}`,
                  )}
                  empty="The coach does not have enough history yet to form stable hypotheses."
                />
                <ListBlock
                  title="Largest opportunity gaps"
                  items={data.memoryProfile.opportunityGaps.map(
                    (gap) => `${gap.workMode}: ${gap.observedShare}% observed vs ${gap.aiShare}% AI use. ${gap.advice}`,
                  )}
                  empty="No large context gap detected yet."
                />
                <ul className="space-y-2 text-zinc-200">
                  <li>Days tracked: {data.memoryProfile.daysTracked}</li>
                  <li>Average daily interactions: {data.memoryProfile.avgDailyInteractions}</li>
                  <li>Average daily minutes: {data.memoryProfile.avgDailyMinutes}</li>
                  <li>Current archetype: {data.memoryProfile.archetype}</li>
                </ul>
                <div className="rounded-2xl border border-white/8 bg-black/30 p-4 font-mono text-xs text-zinc-300">
                  ~/.ai-pm-risk-coach/usage.jsonl{"\n"}
                  ~/.ai-pm-risk-coach/activity.jsonl{"\n"}
                  ~/.ai-pm-risk-coach/claude-session-state.json{"\n"}
                  ~/.ai-pm-risk-coach/profile.json
                </div>
              </div>
              </Panel>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard(props: { title: string; value: string; caption: string; delta?: number }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
      <div className="text-xs uppercase tracking-[0.28em] text-zinc-400">{props.title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{props.value}</div>
      <div className="mt-2 text-sm text-zinc-300">{props.caption}</div>
      {props.delta !== undefined && (
        <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-medium ${props.delta >= 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`}>
          {props.delta >= 0 ? "+" : ""}
          {props.delta} vs trailing 7d
        </div>
      )}
    </div>
  );
}

function Panel(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.035] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{props.title}</h2>
        <p className="mt-1 text-sm text-zinc-400">{props.subtitle}</p>
      </div>
      {props.children}
    </section>
  );
}

function InfoBlock(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{props.label}</div>
      <div className="mt-2 text-sm leading-6 text-zinc-100">{props.value}</div>
    </div>
  );
}

function ListBlock(props: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{props.title}</div>
      <div className="mt-3 space-y-2">
        {props.items.length === 0 && <div className="text-sm text-zinc-400">{props.empty}</div>}
        {props.items.map((item) => (
          <div key={item} className="rounded-2xl border border-white/6 bg-white/4 px-3 py-2 text-sm text-zinc-200">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyablePrompt(props: { label: string; value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/8 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.25em] text-amber-200/70">{props.label}</div>
        <button
          onClick={handleCopy}
          className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-zinc-100 transition hover:bg-black/35"
        >
          {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
        </button>
      </div>
      <pre className="mt-3 whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-amber-50">{props.value}</pre>
    </div>
  );
}

function TrajectoryChart(props: { data: CoachSnapshot["memoryProfile"]["trajectory"] }) {
  if (props.data.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-zinc-300">
        Trajectory appears once the coach has enough daily history.
      </div>
    );
  }

  const width = 680;
  const height = 240;
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const maxValue = Math.max(100, ...props.data.flatMap((point) => [point.amount, point.quality, point.leverage]));
  const xStep = props.data.length > 1 ? innerWidth / (props.data.length - 1) : 0;

  const buildPath = (key: "amount" | "quality" | "leverage") =>
    props.data
      .map((point, index) => {
        const x = padding + index * xStep;
        const y = padding + innerHeight - (point[key] / maxValue) * innerHeight;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  const last = props.data[props.data.length - 1];
  const first = props.data[0];
  const delta = last.leverage - first.leverage;

  return (
    <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Expertise curve</div>
          <div className="mt-2 text-2xl font-semibold text-white">{last.leverage} leverage today</div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-medium ${delta >= 0 ? "bg-emerald-400/15 text-emerald-200" : "bg-red-400/15 text-red-200"}`}>
          {delta >= 0 ? "+" : ""}
          {delta} vs first visible day
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-60 w-full">
        <defs>
          <linearGradient id="leverage-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34,197,94,0.28)" />
            <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="20" fill="rgba(255,255,255,0.02)" />
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + innerHeight - (tick / maxValue) * innerHeight;
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />
              <text x="4" y={y + 4} fill="rgba(161,161,170,0.8)" fontSize="11">
                {tick}
              </text>
            </g>
          );
        })}
        <path d={buildPath("amount")} fill="none" stroke="rgba(251,191,36,0.75)" strokeWidth="3" />
        <path d={buildPath("quality")} fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="3" />
        <path d={buildPath("leverage")} fill="none" stroke="rgba(34,197,94,0.95)" strokeWidth="4" />
      </svg>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <LegendPill label="Amount" tone="amber" value={`${last.amount}`} />
        <LegendPill label="Quality" tone="sky" value={`${last.quality}`} />
        <LegendPill label="Leverage" tone="emerald" value={`${last.leverage}`} />
      </div>
    </div>
  );
}

function LegendPill(props: { label: string; value: string; tone: "amber" | "sky" | "emerald" }) {
  const styles = {
    amber: "border-amber-300/20 bg-amber-300/8 text-amber-100",
    sky: "border-sky-300/20 bg-sky-300/8 text-sky-100",
    emerald: "border-emerald-300/20 bg-emerald-300/8 text-emerald-100",
  }[props.tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${styles}`}>
      <div className="text-xs uppercase tracking-[0.22em] opacity-70">{props.label}</div>
      <div className="mt-2 text-lg font-semibold">{props.value}</div>
    </div>
  );
}

function formatCounts(items: { name: string; count: number }[]) {
  return items.map((item) => `${item.name} (${item.count})`).join(", ");
}

function formatDistributionCounts(items: { name: string; count: number; percentage: number }[]) {
  return items.map((item) => `${item.name} (${item.percentage}%)`).join(", ");
}

function statusTone(status: CoachSnapshot["sessionMonitor"]["sessions"][number]["status"]) {
  switch (status) {
    case "working":
      return "bg-emerald-400/15 text-emerald-200";
    case "waiting":
      return "bg-amber-300/15 text-amber-100";
    case "errored":
      return "bg-red-400/15 text-red-200";
    case "idle":
      return "bg-slate-400/15 text-slate-200";
    default:
      return "bg-white/10 text-zinc-200";
  }
}

function labelize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
