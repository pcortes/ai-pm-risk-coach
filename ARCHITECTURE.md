# Architecture

This document explains how the app works for engineers and LLMs.

## Core Idea

This app is not a team operations system.

It is a personal AI coaching system for one user.

The system continuously combines:
- current local context
- passive activity samples
- today’s logged AI interactions
- cumulative historical usage

and turns that into:
- live advice
- prompt feedback
- benchmark comparisons
- a persistent memory profile

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
- [`src/lib/coach/scoring.ts`](src/lib/coach/scoring.ts)
- [`src/lib/coach/profile.ts`](src/lib/coach/profile.ts)
- [`src/lib/coach/templates.ts`](src/lib/coach/templates.ts)
- [`src/lib/coach/active-context.ts`](src/lib/coach/active-context.ts)
- [`src/lib/coach/storage.ts`](src/lib/coach/storage.ts)

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
3. read usage log and activity log
4. filter today’s entries
5. compute today’s amount/quality/leverage
6. build cumulative memory profile from all entries plus passive activity
7. persist `profile.json`
8. generate benchmark deltas and suggestion queue
9. return one combined JSON snapshot

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

## Prompt Scoring Philosophy

The app does not attempt deep semantic truth.

It uses transparent heuristics.

Signals rewarded:
- context
- concrete deliverables
- constraints
- critique language
- evaluation language
- higher-value work patterns such as eval design or decision analysis

That is deliberate.

The goal is a coach the user can inspect and trust, not a black-box judge.

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
- no external services

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

- more tailored rewrites by work mode
- stronger decision memo templates
- weekly and monthly review views
- more aggressive “you should use AI here” triggers

## LLM Orientation

If you are an LLM editing this repo:

- keep the system local-first
- do not add hidden data collection
- prefer explicit deterministic code over vague magic
- optimize for AI PM risk coaching, not generic productivity
- use the memory profile to improve advice quality, not just to collect more stats
