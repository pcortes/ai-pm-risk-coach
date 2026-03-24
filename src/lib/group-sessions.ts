import { ClaudeSession, SessionGroup } from "./types";

export function groupSessions(sessions: ClaudeSession[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();

  for (const session of sessions) {
    const repoPath = session.parentRepo || session.workingDirectory;
    const repoName = repoPath.split("/").filter(Boolean).pop() || repoPath;

    if (!groups.has(repoPath)) {
      groups.set(repoPath, { repoName, repoPath, sessions: [] });
    }
    groups.get(repoPath)!.sessions.push(session);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.sessions.length !== a.sessions.length) return b.sessions.length - a.sessions.length;
    return a.repoName.localeCompare(b.repoName);
  });
}

/** Flatten sessions in the same order the grid displays them. */
export function flattenGroupedSessions(sessions: ClaudeSession[]): ClaudeSession[] {
  const groups = groupSessions(sessions);
  const flat: ClaudeSession[] = [];
  for (const group of groups) {
    for (const session of group.sessions) {
      flat.push(session);
    }
  }
  return flat;
}
