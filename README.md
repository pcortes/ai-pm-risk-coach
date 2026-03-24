# AI PM Risk Coach

Desktop app for becoming a top-tier AI PM in risk.

This app is designed for a single operator, not a company dashboard.

The goal is simple:
- keep the app open on a side or third screen
- let it watch lightweight local context
- score how well you are using AI
- coach your prompting in real time
- learn your work patterns over time so the advice gets better

This is a local-first coach for:
- AI risk
- policy decisions
- eval design
- red-teaming
- decision memos
- stakeholder communication

## Quick Start

Clone:

```bash
git clone https://github.com/pcortes/ai-pm-risk-coach.git
cd ai-pm-risk-coach
```

Install:

```bash
npm install
```

Run the desktop app:

```bash
npm run electron:dev
```

Run the web app only:

```bash
npm run dev
```

## Requirements

- macOS
- Node.js 20+
- `Claude Code` installed locally if you want the richer Claude-generated coaching layer

Important:
- the app does not require an Anthropic API key in the repo
- the richer coach path uses the local `Claude Code` CLI login if it exists
- if `Claude Code` is not logged in, the app still works, but the deeper coaching layer stays in fallback mode

## Product Thesis

Most AI tools give one-off answers with zero memory of the user.

That is not enough for high-stakes decision work.

This app aims to become a persistent AI PM risk coach that:
- understands how the user tends to work
- benchmarks their AI usage against their own baseline
- spots recurring prompt weaknesses
- recommends where AI should be used more aggressively
- turns a weak prompt into a stronger one before the user sends it

## Current MVP

The current version includes:
- Electron desktop shell
- Next.js app and local API routes
- original `claude-control`-derived Claude Code session monitor
- active macOS app/window detection
- passive activity sampling with local deduping
- automatic AI session capture from dedicated AI apps
- daily usage log stored locally
- prompt scoring
- prompt rewrites
- daily amount / quality / leverage scoring
- cumulative memory profile built from logged history plus passive context
- coach-first dashboard with:
  - daily coach brief
  - expertise trajectory
  - session diagnosis
  - exact next prompt to send
  - historical prompt-pattern coaching
- non-blocking coach route:
  - fast local snapshot immediately
  - richer Claude-generated coaching from cache when available
  - background warming when the cache is missing

## Important Boundaries

This app is not doing invasive surveillance.

Current scope:
- reads the active app name
- tries to read the active window title
- stores lightweight passive activity samples locally
- auto-tracks time in dedicated AI apps from the active window
- reads live Claude Code transcript previews and hook events from local files
- stores prompts only from prompt coach input or local Claude session previews already present on disk

Current non-goals:
- OCR of the whole screen
- hidden keystroke capture
- automatic scraping of all browser content
- background exfiltration to third-party servers

That boundary matters, especially on corporate machines.

## How The Memory Profile Works

The app does not give zero-context advice every time.

Instead, it builds a cumulative memory profile from local history.

The profile synthesizes:
- days tracked
- total interactions
- average daily interactions
- average daily minutes using AI
- top observed apps and work contexts
- recurring work modes
- recurring topics
- strongest prompting behaviors
- persistent coaching priorities
- learned facts
- behavior patterns
- coaching hypotheses
- context opportunity gaps
- trailing 7-day benchmarks
- a rough user archetype

This profile is saved locally and updated from the full history of logged interactions.

Files:

```text
~/.ai-pm-risk-coach/usage.jsonl
~/.ai-pm-risk-coach/activity.jsonl
~/.ai-pm-risk-coach/profile.json
```

So yes: the app can "learn" the user over time, but in an explicit, inspectable, deterministic way.

It does not require manual logging for time tracking inside dedicated AI apps.
Manual input is only for prompt-level coaching.

## Claude Code Integration

The deeper coaching path uses the local `Claude Code` CLI directly.

Important:
- no Anthropic API key is stored in this repo
- no key is read from this repo
- the app does **not** commit or persist secrets
- the richer coach path expects the user to already be logged into `Claude Code`

If `Claude Code` is not logged in, the app still returns the fast local coach snapshot and monitor data.
The Claude-enriched coaching layer just stays unavailable until login exists.

## Architecture

High-level flow:

1. Electron opens a native macOS window
2. Next.js serves the UI and local API routes
3. `/api/coach` builds a live snapshot:
   - current active app/window
   - live Claude Code sessions from the original monitor substrate
   - passive activity sample
   - today’s scorecard
   - cumulative memory profile
    - benchmark deltas
   - immediate fallback coaching
4. if a matching Claude-generated coach snapshot is already cached, it is merged in immediately
5. if no cached Claude coach is ready, the app warms it in the background and picks it up on the next refresh
6. `/api/prompt-score` scores a draft prompt live
7. `/api/entries` stores optional manual entries into local JSONL
   - and captures the active context when the entry is logged

Main modules:

- [`src/lib/coach/storage.ts`](src/lib/coach/storage.ts)
  - local JSONL + profile storage
- [`src/lib/coach/scoring.ts`](src/lib/coach/scoring.ts)
  - prompt assessment and daily scoring
- [`src/lib/coach/profile.ts`](src/lib/coach/profile.ts)
  - cumulative memory profile synthesis
- [`src/lib/coach/active-context.ts`](src/lib/coach/active-context.ts)
  - frontmost app/window detection on macOS
- [`src/lib/coach/engine.ts`](src/lib/coach/engine.ts)
  - builds the full live coach snapshot
- [`src/lib/coach/llm-coach.ts`](src/lib/coach/llm-coach.ts)
  - cached/background Claude-generated coaching
- [`src/lib/monitor/claude-sessions.ts`](src/lib/monitor/claude-sessions.ts)
  - original-session-substrate Claude Code discovery
- [`src/app/page.tsx`](src/app/page.tsx)
  - coach-first UI

For a fuller explanation, see [ARCHITECTURE.md](ARCHITECTURE.md).

## First-Run Expectations

On first launch, the app should open quickly.

What happens next:
- the base coach snapshot returns immediately
- Claude Code session monitoring appears right away if sessions are active
- the app does not show fake heuristic coaching while Claude is unavailable
- memory profile appears immediately from local logs if they exist
- richer Claude-generated coaching may appear on a later refresh if cache is empty and local `Claude Code` is available

If the richer coach layer is unavailable:
- the app should still load
- the dashboard should still work
- the app should stay in monitoring-only mode for coaching surfaces
- the main missing piece will be the deeper session-specific and daily Claude-generated coaching

## How To Check Whether Claude Coaching Is Working

The app exposes this directly in the snapshot and UI.

### In the app

Look in `Live Context`:
- `Coach mode: Claude-generated coaching` means the richer Claude Code coaching layer is active
- `Coach mode: Fallback coaching` means the app is running on the local monitor/memory layer only

### From the API

Run:

```bash
curl -sS http://localhost:3200/api/coach | jq '{coachSource, coachStatusNote}'
```

Expected values:
- `"coachSource": "claude_cached"` means Claude-generated coaching is working
- `"coachSource": "fallback"` means the app is still working, but it is intentionally not showing fake heuristic coaching

### Check the local Claude Code CLI directly

Run:

```bash
claude --print --output-format json --max-turns 1 -- 'Return JSON only: {"ok": true}'
```

What you want:
- a successful JSON response

What it means if it fails:
- if it says something like `Please run /login`, then Claude Code is not logged in for that machine/session yet
- the app will still work, but the richer coaching layer will stay in monitoring-only fallback mode

### Check the cache file

The richer coach layer writes a local cache:

```bash
cat ~/.ai-pm-risk-coach/llm-coach-cache.json
```

What to look for:
- `"status": "success"` means Claude-generated coaching completed and cached
- `"status": "error"` means the app fell back safely and will retry later

## Install

```bash
cd ai-pm-risk-coach
npm install
```

## Run

Web only:

```bash
npm run dev
```

Desktop app:

```bash
npm run electron:dev
```

Build a desktop app:

```bash
npm run electron:build
```

## How To Use It

### 1. Open the app

Keep it open on a side screen.

### 2. Paste or draft prompts in the Prompt Coach panel

The app will:
- score the prompt
- show strengths
- show gaps
- rewrite it into a stronger version

### 3. Let auto-capture do the time tracking

The app auto-tracks supported AI tools from the active window.
Claude Code sessions are tracked from the transcript/hook substrate, not from generic app-focus guesses.

Manual save is optional and mainly improves:
- prompt-quality history
- benchmark accuracy for prompt quality
- richer context for tomorrow’s suggestions

### 4. Use the suggestion queue

The app will suggest where AI can help more:
- decision memos
- risk tradeoff analysis
- eval design
- meeting debriefs
- prompt upgrades

### 5. Use the session coach as the main surface

Each live Claude session card is supposed to answer:
- what this session is really doing
- what is missing
- what a world-class operator would do next
- the exact next prompt to send
- what upgrade that prompt should create

## Why This Is Better Than Per-Chat Advice

Per-chat advice is stateless.

This app is meant to become stateful coaching.

That means:
- if the user often writes vague prompts, the app should keep pushing on structure
- if the user underuses AI for eval design, the app should keep surfacing that gap
- if the user spends most of the day in docs or browser work without AI help, the app should notice that automatically
- if the user mostly uses AI for summaries, the app should push toward decision leverage
- if the user’s quality improves over time, the advice should stop repeating old beginner suggestions

## LLM Handoff

If an LLM is dropped into this repo, the shortest path to understanding is:

1. read [`docs/AI_NATIVE_PM_COACH_PRD.md`](docs/AI_NATIVE_PM_COACH_PRD.md)
2. read [`src/app/page.tsx`](src/app/page.tsx)
3. read [`src/app/api/coach/route.ts`](src/app/api/coach/route.ts)
4. read [`src/lib/coach/engine.ts`](src/lib/coach/engine.ts)
5. read [`src/lib/coach/llm-coach.ts`](src/lib/coach/llm-coach.ts)
6. read [`src/lib/monitor/claude-sessions.ts`](src/lib/monitor/claude-sessions.ts)
7. read [`src/lib/coach/profile.ts`](src/lib/coach/profile.ts)
8. read [`src/lib/coach/scoring.ts`](src/lib/coach/scoring.ts)
9. read [`src/lib/coach/storage.ts`](src/lib/coach/storage.ts)

Important design principles:
- keep it local-first
- keep it inspectable
- keep heuristics as substrate and fallback, not the main visible coach
- prefer personal coaching over generic productivity fluff
- optimize for AI PM risk decision quality, not just “more AI usage”

## Sharing This Repo

If you are sending this repo to a new user:
- point them at this README first
- tell them to run `npm install`
- tell them to run `npm run electron:dev`
- tell them the app is useful immediately, even before richer Claude coaching warms
- tell them richer coaching depends on a local `Claude Code` login, not on any API key in the repo
- tell them how to check `coachSource` in `/api/coach` if they want to confirm the richer coaching layer is active

## Good Next Steps

- browser/tab-aware adapters for ChatGPT, Claude, Gemini, and internal AI tools
- optional importers from exported transcripts
- richer role-specific template packs
- better trend and benchmark views
- optional weekly review
- passive activity review and day-shape timelines
- better active-context inference
- opt-in accessibility integrations, if policy allows

## Tests

```bash
npm run typecheck
npm run test
```
