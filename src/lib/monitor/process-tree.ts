import { execFile } from "child_process";
import { promisify } from "util";
import { PROCESS_TIMEOUT_MS } from "./constants";
import type { ProcessTreeEntry } from "./types";

const execFileAsync = promisify(execFile);

export async function buildProcessTree(): Promise<Map<number, ProcessTreeEntry>> {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid,ppid,%cpu,comm"], {
      timeout: PROCESS_TIMEOUT_MS,
    });
    const tree = new Map<number, ProcessTreeEntry>();
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(.+)$/);
      if (!match) continue;
      tree.set(parseInt(match[1], 10), {
        ppid: parseInt(match[2], 10),
        cpuPercent: parseFloat(match[3].replace(",", ".")) || 0,
        comm: match[4].trim(),
      });
    }
    return tree;
  } catch {
    return new Map();
  }
}

export function findClaudePidsFromTree(processTree: Map<number, ProcessTreeEntry>): number[] {
  const pids: number[] = [];
  for (const [pid, entry] of processTree.entries()) {
    if (entry.comm === "claude") {
      pids.push(pid);
    }
  }
  return pids;
}
