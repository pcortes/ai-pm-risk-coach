import { execFile } from "child_process";
import { promisify } from "util";
import { PROCESS_TIMEOUT_MS } from "./constants";
import type { ProcessTreeEntry } from "./types";

const execFileAsync = promisify(execFile);

export interface ProcessInfo {
  pid: number;
  workingDirectory: string | null;
  cpuPercent: number;
}

export async function getBatchWorkingDirectories(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;

  try {
    const { stdout } = await execFileAsync("lsof", ["-p", pids.join(","), "-Fpn", "-d", "cwd"], {
      timeout: PROCESS_TIMEOUT_MS,
    });

    let currentPid: number | null = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10);
      } else if (line.startsWith("n") && currentPid !== null) {
        result.set(currentPid, line.slice(1));
        currentPid = null;
      }
    }
  } catch {
    return result;
  }

  return result;
}

export async function getAllProcessInfos(
  pids: number[],
  processTree: Map<number, ProcessTreeEntry>,
): Promise<ProcessInfo[]> {
  if (pids.length === 0) return [];

  const workingDirectories = await getBatchWorkingDirectories(pids);
  const infos: ProcessInfo[] = [];

  for (const pid of pids) {
    const entry = processTree.get(pid);
    if (!entry) continue;

    infos.push({
      pid,
      workingDirectory: workingDirectories.get(pid) ?? null,
      cpuPercent: entry.cpuPercent,
    });
  }

  return infos;
}
