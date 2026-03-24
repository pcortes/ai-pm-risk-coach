import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { ActivitySample, AutoUsageSession, CoachUsageEntry, MemoryProfile } from "./types";

const DATA_DIR = join(homedir(), ".ai-pm-risk-coach");
const USAGE_LOG = join(DATA_DIR, "usage.jsonl");
const ACTIVITY_LOG = join(DATA_DIR, "activity.jsonl");
const ACTIVITY_STATE_FILE = join(DATA_DIR, "activity-state.json");
const AUTO_SESSION_FILE = join(DATA_DIR, "auto-session.json");
const PROFILE_FILE = join(DATA_DIR, "profile.json");

export async function ensureCoachDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export function getUsageLogPath() {
  return USAGE_LOG;
}

export async function readUsageEntries(): Promise<CoachUsageEntry[]> {
  await ensureCoachDataDir();
  try {
    const raw = await readFile(USAGE_LOG, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CoachUsageEntry);
  } catch {
    return [];
  }
}

export async function readActivitySamples(): Promise<ActivitySample[]> {
  await ensureCoachDataDir();
  try {
    const raw = await readFile(ACTIVITY_LOG, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ActivitySample);
  } catch {
    return [];
  }
}

export async function appendUsageEntry(entry: CoachUsageEntry) {
  await ensureCoachDataDir();
  await appendFile(USAGE_LOG, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readAutoUsageSession(): Promise<AutoUsageSession | null> {
  try {
    const raw = await readFile(AUTO_SESSION_FILE, "utf8");
    return JSON.parse(raw) as AutoUsageSession;
  } catch {
    return null;
  }
}

export async function writeAutoUsageSession(session: AutoUsageSession) {
  await ensureCoachDataDir();
  await writeFile(AUTO_SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

export async function clearAutoUsageSession() {
  try {
    await writeFile(AUTO_SESSION_FILE, "", "utf8");
  } catch {
    // ignore
  }
}

export async function recordActivitySample(sample: ActivitySample) {
  await ensureCoachDataDir();

  const lastSample = await readLastActivitySample();
  if (lastSample && sameActivityContext(lastSample, sample)) {
    const elapsedMs = Date.parse(sample.timestamp) - Date.parse(lastSample.timestamp);
    if (elapsedMs >= 0 && elapsedMs < 5 * 60 * 1000) {
      return false;
    }
  }

  await appendFile(ACTIVITY_LOG, `${JSON.stringify(sample)}\n`, "utf8");
  await writeFile(ACTIVITY_STATE_FILE, JSON.stringify(sample, null, 2), "utf8");
  return true;
}

export async function writeMemoryProfile(profile: MemoryProfile) {
  await ensureCoachDataDir();
  await writeFile(PROFILE_FILE, JSON.stringify(profile, null, 2), "utf8");
}

export async function readMemoryProfile(): Promise<MemoryProfile | null> {
  try {
    const raw = await readFile(PROFILE_FILE, "utf8");
    return JSON.parse(raw) as MemoryProfile;
  } catch {
    return null;
  }
}

async function readLastActivitySample(): Promise<ActivitySample | null> {
  try {
    const raw = await readFile(ACTIVITY_STATE_FILE, "utf8");
    return JSON.parse(raw) as ActivitySample;
  } catch {
    return null;
  }
}

function sameActivityContext(a: ActivitySample, b: ActivitySample) {
  return a.appName === b.appName && a.windowTitle === b.windowTitle && a.workMode === b.workMode;
}
