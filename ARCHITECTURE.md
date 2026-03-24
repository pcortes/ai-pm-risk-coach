# Architecture

This document explains how the app works for engineers and LLMs.

## Core Idea

This app is not a team operations system.

It is a personal AI coaching system for one user.

The system continuously combines:
- current local context
- passive activity samples
- automatic AI session detection
- live Claude Code session monitoring from the original `claude-control` substrate
- today’s logged AI interactions
- cumulative historical usage

and turns that into:
- a fast local coach snapshot
- prompt feedback
- benchmark comparisons
- a persistent memory profile
- cached or background-warmed Claude-generated coaching

## High-Level Layers

### 1. Shell

Electron provides the native macOS window.

Files:
- [`electron/main.js`](electron/main.js)
- [`electron/preload.js`](electron/preload.js)

### 2. App

Next.js provides:
- the UI
- local API routes

Files:
- [`src/app/page.tsx`](src/app/page.tsx)
- [`src/app/api/coach/route.ts`](src/app/api/coach/route.ts)
- [`src/app/api/prompt-score/route.ts`](src/app/api/prompt-score/route.ts)
- [`src/app/api/entries/route.ts`](src/app/api/entries/route.ts)

### 3. Coaching Engine

The coaching engine is the real product logic.

Files:
- [`src/lib/coach/engine.ts`](src/lib/coach/engine.ts)
- [`src/lib/coach/llm-coach.ts`](src/lib/coach/llm-coach.ts)
- [`src/lib/coach/scoring.ts`](src/lib/coach/scoring.ts)
- [`src/lib/coach/profile.ts`](src/lib/coach/profile.ts)
- [`src/lib/coach/templates.ts`](src/lib/coach/templates.ts)
- [`src/lib/coach/active-context.ts`](src/lib/coach/active-context.ts)
- [`src/lib/coach/storage.ts`](src/lib/coach/storage.ts)

### 4. Claude Monitor

The monitor for live Claude sessions comes from the original working `claude-control` code path, adapted into this repo.

Files:
- [`src/lib/monitor/claude-sessions.ts`](src/lib/monitor/claude-sessions.ts)
- [`src/lib/monitor/session-reader.ts`](src/lib/monitor/session-reader.ts)
- [`src/lib/monitor/hooks-reader.ts`](src/lib/monitor/hooks-reader.ts)
- [`src/lib/monitor/process-utils.ts`](src/lib/monitor/process-utils.ts)
- [`src/lib/monitor/process-tree.ts`](src/lib/monitor/process-tree.ts)

## Data Model

### `usage.jsonl`

Append-only interaction log.

Each line is a JSON object with:
- timestamp
- tool
- prompt
- response
- minutes
- tags
- outcome
- notes
- context app name
- context window title
- context work mode
- source
- prompt capture mode
- session start/end timestamps

### `activity.jsonl`

Append-only passive context log.

Each line is a JSON object with:
- timestamp
- appName
- windowTitle
- workMode

### `profile.json`

Derived memory profile.

This file is not user-authored state.
It is generated from the full interaction history.

It includes:
- averages
- trajectory
- top tools
- top categories
- top observed apps
- top observed work modes
- recurring topics
- strengths
- coaching priorities
- learned facts
- behavior patterns
- coaching hypotheses
- context opportunity gaps
- benchmark trend
- user archetype
- profile summary

## Request Flow

### `/api/coach`

Purpose:
- produce the full live dashboard state

Flow:
1. detect active app and frontmost window title
2. record a passive activity sample if the context changed or enough time passed
3. auto-detect supported AI tool sessions from the active window and finalize usage entries when sessions end
4. read usage log and activity log
5. filter today’s entries
6. compute today’s amount/quality/leverage
7. build cumulative memory profile from all entries plus passive activity
8. persist `profile.json`
9. build the fast fallback coach view immediately
10. try to merge cached Claude-generated coaching if an exact cached analysis exists
11. if not cached, warm Claude coaching in the background without blocking the response
12. return one combined JSON snapshot immediately

Runtime expectation:
- first paint should not wait for a fresh Claude analysis
- a fresh Claude analysis is opportunistic and cache-backed
- the app must stay usable even when Claude enrichment is unavailable
- if Claude enrichment is unavailable, the app should not invent fake heuristic coaching in its place

Operational check:
- `/api/coach` now returns `coachSource` and `coachStatusNote`
- `coachSource: "claude_cached"` means cached Claude-generated coaching was merged
- `coachSource: "fallback"` means the dashboard is running on the local substrate only and coaching surfaces should stay monitoring-only

### `/api/prompt-score`

Purpose:
- score a draft prompt in real time

Flow:
1. receive raw prompt text
2. run heuristic prompt analysis
3. return:
   - score
   - strengths
   - gaps
   - categories
   - rewrite

### `/api/entries`

Purpose:
- log new usage interactions

Flow:
1. validate request payload
2. capture active context if not already provided
3. append JSONL line
4. return the stored entry

This route is now optional.
It exists for prompt-level coaching or extra manual context, not baseline time tracking.

## Coaching Philosophy

There are two layers:

1. substrate and fallback
2. richer coach output

The substrate layer is deliberately transparent:
- session classification
- prompt scoring
- memory synthesis
- baseline scoring
- fallback coach behavior

The richer coach layer is generated through the local `Claude Code` CLI when available.
That layer is:
- cached
- asynchronous
- optional for first paint
- dependent on an existing `Claude Code` login
- never dependent on an API key stored in this repo
- expected to fail safely without breaking the main dashboard

Verification path:
1. confirm `claude --print ...` works locally
2. confirm `/api/coach` returns `coachSource: "claude_cached"`
3. confirm `~/.ai-pm-risk-coach/llm-coach-cache.json` shows `"status": "success"`

This gives fast UI plus room for world-class coaching depth.

## Memory Profile Philosophy

The memory profile is the mechanism that makes the advice cumulative instead of stateless.

This is the key to better coaching over time.

Without it:
- every prompt is judged in isolation
- the app repeats generic advice forever

With it:
- the app can learn recurring weaknesses
- the app can learn where the workday actually happens
- the app can detect underused high-leverage AI behaviors
- the app can compare the user to their own recent baseline
- the app can personalize suggestion priority

## Why This Is Not “Recursive Magic”

The phrase “recursive learning” is easy to over-romanticize.

What this repo actually does is safer and better:
- accumulate interaction history
- accumulate lightweight passive context history
- synthesize a profile deterministically
- use that profile to improve future coaching

That is enough to get compounding value without introducing opaque self-modifying behavior.

## Constraints

Current constraints:
- macOS focused
- active context is lightweight
- no full-screen OCR
- no hidden scraping
- no API-key path in the repo
- no secret persistence in repo state
- deeper coaching depends on `Claude Code` login, not a bundled secret

Those are product choices, not accidents.

They reduce policy risk and keep the app deployable on real work machines.

## Best Next Extensions

### Better Context

- browser tab title awareness
- optional document title classification
- stronger work-mode inference

### Better Learning

- role-specific benchmark profiles
- topic memory clusters
- longitudinal trend views
- prompt pattern mining
- more explicit fact and hypothesis tracking

### Better Coaching

- richer cached LLM-generated coaching by work mode
- stronger decision memo templates
- weekly and monthly review views
- more aggressive “you should use AI here” triggers

## LLM Orientation

If you are an LLM editing this repo:

- keep the system local-first
- do not add hidden data collection
- keep heuristics as substrate and fallback, not the only visible coach
- optimize for AI PM risk coaching, not generic productivity
- use the memory profile to improve advice quality, not just to collect more stats
- preserve the “fast local snapshot first, richer coach second” runtime behavior
