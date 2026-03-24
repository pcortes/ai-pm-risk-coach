"use client";

import { useState } from "react";
import { CooPriority, CooRoadmapLane, SessionCooBrief, getReplyTypeLabel } from "@/lib/coo-advisor";
import { CooActionMeta, logCooOperatorAction, sendMessageAction, stageMessageAction } from "@/lib/actions";
import { SessionProvider } from "@/lib/types";

const priorityStyles: Record<CooPriority, { badge: string; panel: string; dot: string }> = {
  critical: {
    badge: "bg-red-500/12 text-red-300 border-red-500/20",
    panel: "border-red-500/16 bg-red-500/6",
    dot: "bg-red-400",
  },
  high: {
    badge: "bg-amber-500/12 text-amber-300 border-amber-500/20",
    panel: "border-amber-500/16 bg-amber-500/6",
    dot: "bg-amber-400",
  },
  medium: {
    badge: "bg-blue-500/12 text-blue-300 border-blue-500/20",
    panel: "border-blue-500/16 bg-blue-500/6",
    dot: "bg-blue-400",
  },
  low: {
    badge: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
    panel: "border-white/7 bg-white/[0.03]",
    dot: "bg-zinc-500",
  },
};

const roadmapStyles: Record<CooRoadmapLane, string> = {
  marketing: "border-emerald-500/14 bg-emerald-500/6 text-emerald-200",
  product: "border-amber-500/14 bg-amber-500/6 text-amber-200",
  engineering: "border-blue-500/14 bg-blue-500/6 text-blue-200",
};

export function CooBrief({
  brief,
  provider,
  providerSessionId,
  pid,
  draftMeta,
}: {
  brief: SessionCooBrief;
  provider?: SessionProvider;
  providerSessionId?: string;
  pid?: number | null;
  draftMeta?: CooActionMeta;
}) {
  const styles = priorityStyles[brief.priority];
  const [draftOpen, setDraftOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const canSendManagedDraft = provider === "codex" && !!providerSessionId && !!draftMeta;

  async function handleCopyDraft() {
    if (!brief.suggestedReply) return;
    try {
      await navigator.clipboard.writeText(brief.suggestedReply);
      setCopyState("copied");
      if (draftMeta) {
        await logCooOperatorAction({ ...draftMeta, operatorAction: "copy-draft" });
      }
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  async function handleLoadDraft() {
    if (!brief.suggestedReply || !pid || !draftMeta) return;
    setLoadState("loading");
    try {
      await stageMessageAction(pid, brief.suggestedReply, { ...draftMeta, operatorAction: "load-draft" });
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
    setTimeout(() => setLoadState("idle"), 1500);
  }

  async function handleSendDraft() {
    if (!brief.suggestedReply || !provider || !providerSessionId || !draftMeta) return;
    setLoadState("loading");
    try {
      await sendMessageAction({
        provider,
        providerSessionId,
        path: draftMeta.repoPath,
        message: brief.suggestedReply,
        meta: {
          ...draftMeta,
          operatorAction: "reply",
        },
      });
      setLoadState("loaded");
    } catch {
      setLoadState("error");
    }
    setTimeout(() => setLoadState("idle"), 1500);
  }

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${styles.panel}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
            COO
          </span>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles.badge}`}
        >
          {brief.priority}
        </span>
      </div>

      <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        Situation: <span className="text-zinc-300">{brief.situation}</span>
      </div>

      <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        Operator move: <span className="text-zinc-300">{getReplyTypeLabel(brief.replyType)}</span>
      </div>

      <div className="mt-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Board call</div>
        <p className="mt-1 text-[12px] font-medium leading-relaxed text-zinc-100">{brief.headline}</p>
      </div>

      <div className="mt-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Governing constraint</div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{brief.why}</p>
      </div>

      <div className="mt-2.5">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Immediate move</div>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-zinc-300/90">{brief.nextActions[0]}</p>

      <div className="mt-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Roadmap By Function</div>
        <div className="mt-2 grid gap-2">
          {brief.roadmaps.map((track) => (
            <div key={track.lane} className={`rounded-lg border px-2.5 py-2 ${roadmapStyles[track.lane]}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em]">{track.lane}</div>
              <div className="mt-1 text-[11px] font-medium leading-relaxed text-zinc-100">{track.headline}</div>
              <div className="mt-1.5 space-y-1.5">
                {track.actions.slice(0, 2).map((action) => (
                  <div key={action} className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-300/90">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {brief.suggestedReply && (
        <div className="mt-2.5 rounded-lg border border-cyan-500/15 bg-cyan-500/6 px-2.5 py-2">
          <button
            onClick={() => setDraftOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300/90">
              Draft reply ready
            </span>
            <span className="text-[10px] text-cyan-200/80">{draftOpen ? "Hide" : "Preview"}</span>
          </button>

          {draftOpen && (
            <div className="mt-2.5 space-y-2.5">
              <p className="rounded-lg border border-white/7 bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-cyan-50/90 whitespace-pre-wrap">
                {brief.suggestedReply}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyDraft}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-200 hover:bg-white/8 transition-colors"
                >
                  {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy"}
                </button>
                {pid && draftMeta && (
                  <button
                    onClick={handleLoadDraft}
                    className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/16 transition-colors"
                    >
                      {loadState === "loading"
                        ? "Loading..."
                        : loadState === "loaded"
                          ? "Loaded in terminal"
                        : loadState === "error"
                          ? "Load failed"
                      : "Load in terminal"}
                  </button>
                )}
                {!pid && canSendManagedDraft && (
                  <button
                    onClick={handleSendDraft}
                    className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-500/16 transition-colors"
                  >
                    {loadState === "loading"
                      ? "Sending..."
                      : loadState === "loaded"
                        ? "Sent to Codex"
                        : loadState === "error"
                          ? "Send failed"
                          : "Send to Codex"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
