# AI PM Risk Coach Notes

This file exists to orient coding agents quickly.

## Product

This app is a personal AI use coach for someone doing high-stakes AI PM / risk work.

It is not:
- a company dashboard
- a repo/session monitor
- a project management system

It is:
- a live side-screen coach
- a prompt quality scorer
- a usage benchmarker
- a cumulative memory-profile system
- a Claude-session mentor

## Core Product Question

How do we help one user become dramatically better at using AI for:
- decisions
- policy tradeoffs
- eval design
- risk framing
- stakeholder communication

## Current MVP Boundaries

- local-first only
- no server backend
- no API-key path in this repo
- active app/window awareness only
- original `claude-control`-derived Claude Code monitor
- background-warmed Claude-generated coaching when local `Claude Code` login exists
- inspectable memory profile

## Files To Understand First

1. `src/app/page.tsx`
2. `src/app/api/coach/route.ts`
3. `src/lib/coach/engine.ts`
4. `src/lib/coach/llm-coach.ts`
5. `src/lib/monitor/claude-sessions.ts`
6. `src/lib/coach/profile.ts`
7. `src/lib/coach/scoring.ts`
8. `src/lib/coach/storage.ts`

## New LLM Onboarding

If you are a new coding agent in this repo:

1. read `README.md`
2. read `docs/AI_NATIVE_PM_COACH_PRD.md`
3. read `ARCHITECTURE.md`
4. then inspect the files listed above

You should quickly understand:
- this is a personal AI coach, not a company dashboard
- the Claude monitor comes from the original working `claude-control` substrate
- the app should load fast even if richer Claude coaching is unavailable
- there is no API-key path in this repo; richer coaching depends on local `Claude Code` login

## Design Rules

- prioritize coaching quality over feature count
- use heuristics for substrate and fallback, not as the main coach experience
- keep the memory/profile system explicit and inspectable
- avoid converting this into a company/service dashboard
- optimize for a user who wants to become world-class at AI leverage in risk work
- keep first load fast; richer coaching can warm in the background
- never commit or persist secrets in the repo
