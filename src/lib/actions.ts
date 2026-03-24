import { mutate } from "swr";
import { SessionProvider } from "./types";

const REFRESH_DELAYS = [300, 700, 1200, 2000, 3000];

export interface CooActionMeta {
  repoPath: string;
  repoName?: string | null;
  sessionKey?: string | null;
  fingerprint?: string | null;
  operatorAction?: "approve" | "reject" | "reply" | "copy-draft" | "load-draft" | "use-draft" | "focus";
}

/** Burst SWR revalidations to catch backend state changes quickly after an action. */
export function refreshAfterAction() {
  for (const ms of REFRESH_DELAYS) {
    setTimeout(() => mutate("/api/sessions"), ms);
  }
}

/** Send a keystroke to a Claude session via the API, then refresh. */
export async function sendKeystrokeAction(pid: number, keystroke: string, meta?: CooActionMeta) {
  const response = await fetch("/api/actions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send-keystroke", pid, keystroke, ...meta }),
  });
  if (!response.ok) throw new Error(`Keystroke failed: ${response.status}`);
  refreshAfterAction();
}

export async function sendMessageAction({
  provider,
  providerSessionId,
  pid,
  path,
  message,
  meta,
}: {
  provider: SessionProvider;
  providerSessionId: string;
  pid?: number | null;
  path: string;
  message: string;
  meta?: CooActionMeta;
}) {
  const response = await fetch("/api/actions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "send-message",
      provider,
      providerSessionId,
      path,
      pid: pid ?? undefined,
      message,
      ...meta,
    }),
  });
  if (!response.ok) throw new Error(`Send message failed: ${response.status}`);
  refreshAfterAction();
}

export async function stageMessageAction(pid: number, message: string, meta?: CooActionMeta) {
  const response = await fetch("/api/actions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stage-message", pid, message, ...meta }),
  });
  if (!response.ok) throw new Error(`Stage message failed: ${response.status}`);
  refreshAfterAction();
}

export async function logCooOperatorAction(meta: CooActionMeta) {
  const response = await fetch("/api/actions/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "log-operator-action", ...meta }),
  });
  if (!response.ok) throw new Error(`Log action failed: ${response.status}`);
  refreshAfterAction();
}
