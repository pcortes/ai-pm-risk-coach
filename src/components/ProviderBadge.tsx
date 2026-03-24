"use client";

import { SessionProvider } from "@/lib/types";

const providerStyles: Record<SessionProvider, string> = {
  claude: "border-violet-500/20 bg-violet-500/10 text-violet-300",
  codex: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
};

export function ProviderBadge({ provider }: { provider: SessionProvider }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${providerStyles[provider]}`}
    >
      {provider}
    </span>
  );
}
