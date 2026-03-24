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
- no external APIs
- active app/window awareness only
- user-logged interactions
- inspectable memory profile

## Files To Understand First

1. `src/app/page.tsx`
2. `src/app/api/coach/route.ts`
3. `src/lib/coach/engine.ts`
4. `src/lib/coach/profile.ts`
5. `src/lib/coach/scoring.ts`
6. `src/lib/coach/storage.ts`

## Design Rules

- prioritize coaching quality over feature count
- prefer transparent heuristics over hidden complexity
- keep the memory/profile system explicit and inspectable
- avoid converting this into a company/service dashboard
- optimize for a user who wants to become world-class at AI leverage in risk work
