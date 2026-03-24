"use client";

import { CooPriority, CooProjectFocusView, getReplyTypeLabel } from "@/lib/coo-advisor";

const priorityStyles: Record<CooPriority, { card: string; badge: string }> = {
  critical: {
    card: "border-red-500/18 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_55%),linear-gradient(180deg,rgba(12,12,16,0.96),rgba(6,6,9,0.96))]",
    badge: "border-red-500/25 bg-red-500/12 text-red-300",
  },
  high: {
    card: "border-amber-500/18 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_55%),linear-gradient(180deg,rgba(12,12,16,0.96),rgba(6,6,9,0.96))]",
    badge: "border-amber-500/25 bg-amber-500/12 text-amber-300",
  },
  medium: {
    card: "border-blue-500/18 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_55%),linear-gradient(180deg,rgba(12,12,16,0.96),rgba(6,6,9,0.96))]",
    badge: "border-blue-500/25 bg-blue-500/12 text-blue-300",
  },
  low: {
    card: "border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_55%),linear-gradient(180deg,rgba(12,12,16,0.96),rgba(6,6,9,0.96))]",
    badge: "border-white/10 bg-white/5 text-zinc-300",
  },
};

export function CooFocusPanel({
  focus,
  waitingCount,
  reviewCount,
  atRiskCount,
  onSelectSessionKey,
}: {
  focus: CooProjectFocusView[];
  waitingCount: number;
  reviewCount: number;
  atRiskCount: number;
  onSelectSessionKey?: (sessionKey: string) => void;
}) {
  if (focus.length === 0) return null;

  const stats = [
    { label: "Need Response", value: waitingCount, tone: "text-blue-300" },
    { label: "Need Review", value: reviewCount, tone: "text-amber-300" },
    { label: "At Risk", value: atRiskCount, tone: "text-red-300" },
  ];

  return (
    <section className="mb-8 rounded-[1.6rem] border border-white/7 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_32%),linear-gradient(180deg,rgba(10,10,15,0.96),rgba(4,4,7,0.98))] p-5 shadow-[0_12px_60px_rgba(0,0,0,0.35)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">COO Focus</div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">Strategic operating stack</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Each card names the governing constraint, the next operator move, and the highest-leverage actions for that
            repo.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/7 bg-white/[0.03] px-3.5 py-3">
              <div className={`text-xl font-semibold ${stat.tone}`}>{stat.value}</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {focus.map((item, index) => {
          const styles = priorityStyles[item.priority];
          const deltaLabel =
            item.delta === null
              ? null
              : item.delta > 0
                ? `↑${item.delta}`
                : item.delta < 0
                  ? `↓${Math.abs(item.delta)}`
                  : "→0";
          const complianceLabel =
            item.compliance.status === "resolved"
              ? "resolved"
              : item.compliance.status === "acted"
                ? item.compliance.aligned === false
                  ? "overrode"
                  : "followed"
                : "pending";
          const card = (
            <div
              className={`rounded-2xl border p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 ${styles.card}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Rank {index + 1}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-zinc-100">{item.repoName}</div>
                  {item.taskTitle && <div className="mt-1 text-xs text-zinc-500">{item.taskTitle}</div>}
                </div>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles.badge}`}
                >
                  {item.priority}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.12em]">
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-zinc-300">
                  {item.situation}
                </span>
                <span className="rounded-full border border-cyan-500/18 bg-cyan-500/8 px-2 py-1 text-cyan-300">
                  {getReplyTypeLabel(item.replyType)}
                </span>
                {deltaLabel && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-zinc-300">
                    {deltaLabel}
                  </span>
                )}
                <span
                  className={`rounded-full border px-2 py-1 ${
                    complianceLabel === "followed"
                      ? "border-emerald-500/18 bg-emerald-500/8 text-emerald-300"
                      : complianceLabel === "overrode"
                        ? "border-red-500/18 bg-red-500/8 text-red-300"
                        : complianceLabel === "resolved"
                          ? "border-blue-500/18 bg-blue-500/8 text-blue-300"
                          : "border-white/10 bg-white/5 text-zinc-300"
                  }`}
                >
                  {complianceLabel}
                </span>
              </div>

              <div className="mt-4 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Board call</div>
              <div className="mt-1 text-sm font-medium leading-relaxed text-zinc-100">{item.headline}</div>
              <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Governing constraint
              </div>
              <div className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{item.why}</div>

              <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Immediate move
              </div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-zinc-300/90">{item.nextActions[0]}</div>

              <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Functional roadmap
              </div>
              <div className="mt-1.5 space-y-2">
                {item.roadmaps.map((track) => (
                  <div key={track.lane} className="rounded-xl border border-white/7 bg-black/15 px-2.5 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      {track.lane}
                    </div>
                    <div className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-100">{track.headline}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-zinc-400">{track.actions[0]}</div>
                  </div>
                ))}
              </div>

              {item.compliance.evidence && (
                <div className="mt-2 text-[11px] leading-relaxed text-zinc-500">{item.compliance.evidence}</div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400">
                <span className="rounded-full border border-white/8 bg-white/4 px-2 py-1">
                  {item.sessionCount} session{item.sessionCount === 1 ? "" : "s"}
                </span>
                {item.waitingCount > 0 && (
                  <span className="rounded-full border border-blue-500/18 bg-blue-500/8 px-2 py-1 text-blue-300">
                    {item.waitingCount} waiting
                  </span>
                )}
                {item.dirtyCount > 0 && (
                  <span className="rounded-full border border-amber-500/18 bg-amber-500/8 px-2 py-1 text-amber-300">
                    {item.dirtyCount} dirty
                  </span>
                )}
                {item.suggestedReply && (
                  <span className="rounded-full border border-cyan-500/18 bg-cyan-500/8 px-2 py-1 text-cyan-300">
                    draft ready
                  </span>
                )}
              </div>
            </div>
          );

          if (!onSelectSessionKey) {
            return <div key={`${item.repoPath}-${item.sessionKey}`}>{card}</div>;
          }

          return (
            <button
              key={`${item.repoPath}-${item.sessionKey}`}
              onClick={() => onSelectSessionKey(item.sessionKey)}
              className="rounded-2xl text-left outline-hidden focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              {card}
            </button>
          );
        })}
      </div>
    </section>
  );
}
