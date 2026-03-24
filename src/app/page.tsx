"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CoachSnapshot, PromptAssessment } from "@/lib/coach/types";

const fetcher = (url: string) =>
  fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  });

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<CoachSnapshot>("/api/coach", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  });
  const [draftPrompt, setDraftPrompt] = useState("");
  const [promptAssessment, setPromptAssessment] = useState<PromptAssessment | null>(null);
  const [logTool, setLogTool] = useState("chatgpt");
  const [logMinutes, setLogMinutes] = useState("15");
  const [logTags, setLogTags] = useState("ai-risk");
  const [logOutcome, setLogOutcome] = useState("");
  const [logStatus, setLogStatus] = useState<string | null>(null);

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

  async function handleLogEntry() {
    if (!draftPrompt.trim()) return;

    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: logTool,
        prompt: draftPrompt,
        minutes: Number.parseInt(logMinutes, 10) || 0,
        tags: logTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        outcome: logOutcome.trim() || null,
      }),
    });

    if (!response.ok) {
      setLogStatus("Failed to log interaction.");
      return;
    }

    setLogStatus("Logged interaction.");
    setLogOutcome("");
    mutate();
  }

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
              title="Auto Capture"
              value={data.autoCapture.detectedTool ?? "On"}
              caption={data.autoCapture.note}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <Panel title="Live Context" subtitle="What the app sees right now">
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Frontmost app" value={data.activeContext.appName ?? "Unknown"} />
                <InfoBlock label="Detected work mode" value={data.activeContext.workMode} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoBlock label="Auto capture" value={data.autoCapture.detectedTool ? `Tracking ${data.autoCapture.detectedTool}` : "Standing by"} />
                <InfoBlock label="Capture mode" value={data.autoCapture.promptCaptureMode ?? "context only"} />
              </div>
              <InfoBlock label="Window title" value={data.activeContext.windowTitle ?? "Unavailable"} />
              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/8 p-4 text-sm leading-6 text-sky-100">
                {data.activeContext.opportunity}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-zinc-100">Live advice</h3>
                {data.liveAdvice.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-zinc-200">
                    {item}
                  </div>
                ))}
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

          <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
            <Panel title="Prompt Coach" subtitle="Paste the prompt you are about to use">
              <textarea
                value={draftPrompt}
                onChange={(event) => setDraftPrompt(event.target.value)}
                placeholder="Paste or draft your current prompt here..."
                className="titlebar-no-drag min-h-[240px] w-full rounded-3xl border border-white/10 bg-black/35 px-5 py-4 text-sm leading-6 text-zinc-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
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

            <Panel title="Optional Save" subtitle="Auto-capture tracks time automatically. Use this only when you want prompt-level scoring or extra context.">
              <div className="space-y-3">
                <label className="block text-sm text-zinc-300">
                  Tool
                  <select value={logTool} onChange={(event) => setLogTool(event.target.value)} className="titlebar-no-drag mt-1 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none">
                    <option value="chatgpt">ChatGPT</option>
                    <option value="claude">Claude</option>
                    <option value="meta-ai">Meta AI</option>
                    <option value="gemini">Gemini</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block text-sm text-zinc-300">
                  Minutes
                  <input value={logMinutes} onChange={(event) => setLogMinutes(event.target.value)} className="titlebar-no-drag mt-1 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none" />
                </label>
                <label className="block text-sm text-zinc-300">
                  Tags
                  <input value={logTags} onChange={(event) => setLogTags(event.target.value)} placeholder="ai-risk, memo, evals" className="titlebar-no-drag mt-1 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none" />
                </label>
                <label className="block text-sm text-zinc-300">
                  Outcome
                  <input value={logOutcome} onChange={(event) => setLogOutcome(event.target.value)} placeholder="Used in leadership prep" className="titlebar-no-drag mt-1 w-full rounded-2xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-zinc-100 outline-none" />
                </label>
                <button
                  onClick={handleLogEntry}
                  className="titlebar-no-drag w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  Log current prompt
                </button>
                {logStatus && <div className="text-sm text-zinc-300">{logStatus}</div>}
              </div>
              <div className="mt-5 space-y-3">
                <h3 className="text-sm font-medium text-zinc-100">Latest logged interactions</h3>
                {data.latestEntries.length === 0 && <div className="text-sm text-zinc-400">No entries logged yet today.</div>}
                {data.latestEntries.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.prompt}`} className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-zinc-200">
                    <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-zinc-500">
                      <span>{entry.tool} · {entry.source ?? "manual"}</span>
                      <span>{entry.minutes}m</span>
                    </div>
                    <div>{entry.prompt}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="Suggestion Queue" subtitle="High-value ways to use AI next">
              <div className="space-y-4">
                {data.suggestionQueue.map((suggestion) => (
                  <div key={suggestion.title} className="rounded-3xl border border-white/8 bg-white/4 p-5">
                    <div className="text-lg font-medium text-white">{suggestion.title}</div>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{suggestion.why}</p>
                    <p className="mt-3 text-sm font-medium text-sky-200">{suggestion.action}</p>
                    <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/30 p-4 text-sm leading-6 text-zinc-100">{suggestion.prompt}</pre>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Learning Loop" subtitle="Persistent, local, and inspectable">
              <div className="space-y-4 text-sm leading-6 text-zinc-300">
                <p>
                  This app does not give one-off zero-context advice. It automatically tracks AI usage time from supported tools and combines that with passive activity samples from the frontmost app/window.
                </p>
                <p>
                  Prompt Coach stays separate because that is the high-signal layer for prompt quality. Time tracking is automatic; prompt-level coaching stays intentional.
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
                  ~/.ai-pm-risk-coach/profile.json
                </div>
              </div>
            </Panel>
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

function formatCounts(items: { name: string; count: number }[]) {
  return items.map((item) => `${item.name} (${item.count})`).join(", ");
}

function formatDistributionCounts(items: { name: string; count: number; percentage: number }[]) {
  return items.map((item) => `${item.name} (${item.percentage}%)`).join(", ");
}
