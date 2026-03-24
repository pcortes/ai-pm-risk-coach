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
- active macOS app/window detection
- passive activity sampling with local deduping
- daily usage log stored locally
- prompt scoring
- prompt rewrites
- daily amount / quality / leverage scoring
- cumulative memory profile built from logged history plus passive context
- suggestion queue based on active context plus the learned profile

## Important Boundaries

This app is not doing invasive surveillance.

Current scope:
- reads the active app name
- tries to read the active window title
- stores lightweight passive activity samples locally
- stores only the prompts and metadata the user logs or pastes

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

## Architecture

High-level flow:

1. Electron opens a native macOS window
2. Next.js serves the UI and local API routes
3. `/api/coach` builds a live snapshot:
   - current active app/window
   - passive activity sample
   - today’s scorecard
   - cumulative memory profile
   - benchmark deltas
   - live advice
   - suggestion queue
4. `/api/prompt-score` scores a draft prompt live
5. `/api/entries` stores new usage entries into local JSONL
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
- [`src/app/page.tsx`](src/app/page.tsx)
  - dashboard UI

For a fuller explanation, see [ARCHITECTURE.md](ARCHITECTURE.md).

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

### 3. Log meaningful interactions

Each log entry improves:
- daily scoring
- benchmark accuracy
- memory profile quality
- tomorrow’s suggestions

### 4. Use the suggestion queue

The app will suggest where AI can help more:
- decision memos
- risk tradeoff analysis
- eval design
- meeting debriefs
- prompt upgrades

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

1. read [`src/app/page.tsx`](src/app/page.tsx)
2. read [`src/app/api/coach/route.ts`](src/app/api/coach/route.ts)
3. read [`src/lib/coach/engine.ts`](src/lib/coach/engine.ts)
4. read [`src/lib/coach/profile.ts`](src/lib/coach/profile.ts)
5. read [`src/lib/coach/scoring.ts`](src/lib/coach/scoring.ts)
6. read [`src/lib/coach/storage.ts`](src/lib/coach/storage.ts)

Important design principles:
- keep it local-first
- keep it inspectable
- keep the scoring explainable
- prefer personal coaching over generic productivity fluff
- optimize for AI PM risk decision quality, not just “more AI usage”

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
```
