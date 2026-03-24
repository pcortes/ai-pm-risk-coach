# AI-Native PM Coach PRD

## Product
`AI PM Risk Coach` is a real-time mentor for an operator who wants to become a world-class AI-native PM in a high-stakes risk org.

This is not a usage tracker.

It is a local-first coaching system that:
- watches real `Claude Code` sessions on the original `claude-control` monitor substrate
- learns the user's recurring AI workflows over time
- scores improvement against a world-class bar
- gives exact next moves, prompt upgrades, and workflow advice in the moment
- builds a memory profile so the coaching gets sharper over time

## User
A PM or AI PM in a risk-heavy org who wants to:
- make better decisions with AI
- write sharper docs, emails, and executive updates
- run stronger reviews and stakeholder alignment
- build better evals, harnesses, and risk analyses
- use `Claude Code` and internal AI tools at a much higher level than peers

## Core Jobs
The user should be able to open this app on a side screen and immediately understand:
1. What should I do right now to use AI better in my active sessions?
2. Where am I still weak as an AI-native operator?
3. What world-class workflows am I not using enough yet?
4. Am I getting better over time, or just spending more time?

## Product Principles
- Coach-first, not dashboard-first
- Exact next move beats abstract advice
- Evidence beats vibes
- Sessions matter, but long-term patterns matter more
- Local memory should sharpen the coach over time
- World-class standard, not generic productivity advice

## UX / IA
### 1. Daily Coach Brief
The first panel should answer:
- what is the call on today?
- what is the biggest gap?
- what should she do in the next hour?
- what habits should she build over the next week?

Required sections:
- `RIGHT NOW`
- `GENERALLY`
- `Use cases to try`
- `Prompt issues`
- `World-class bar`

### 2. Session Coach
Each live Claude session card should answer:
- what is this session actually trying to do?
- what is missing?
- what would a world-class operator do next?
- what exact message should she send now?
- what upgrade should that create?

Card order:
1. session title / repo / state
2. diagnosis
3. next best move
4. exact prompt to send now
5. expected upgrade
6. supporting evidence from latest user / assistant turns

### 3. Memory + Workflow Coach
This should describe recurring patterns over time:
- where she uses AI most
- where she should use it more
- what workflows she repeats
- what weaknesses are persistent
- whether she is improving or plateauing

This is where the app should coach beyond terminal work:
- emails
- doc prep
- meeting prep
- stakeholder communication
- research synthesis
- coding
- planning
- testing
- eval design

### 4. Expertise Trajectory
The user needs a visual showing whether she is becoming more expert over time.

The initial version should show:
- leverage over time
- prompt quality over time
- amount of meaningful use over time

Later versions should add:
- rigor
- evaluation maturity
- planning quality
- verification discipline
- reuse / systems maturity

## What “World-Class” Means
A world-class AI-native PM in risk:
- turns vague questions into decision-ready artifacts
- uses AI for reviewer-grade challenge, not just drafting
- asks for tradeoffs, objections, uncertainty, and reversal criteria
- builds evals, rubrics, and harnesses instead of stopping at prose
- closes sessions with proof, not just answers
- creates reusable systems: templates, playbooks, checklists, reviewers' packets
- improves weekly because the workflow itself gets sharper

## Scoring Model
Current:
- amount
- quality
- leverage

Target:
- coverage
- rigor
- decision quality
- writing / communication quality
- coding rigor
- evaluation maturity
- reuse / systems maturity
- learning velocity

## Inputs
### Current
- live `Claude Code` sessions from original `claude-control` transcript + hook monitor
- local usage history
- passive context samples
- memory profile

### Future
- Meta Mate sessions
- curated frontier playbook from external research
- workflow-specific benchmarks
- direct session draft injection back into managed terminals

## Coaching Engine
### Required behavior
- primary coaching should come from LLM analysis
- heuristics are allowed only as substrate, fallback, or shaping signals
- advice must be grounded in session evidence and memory
- advice must distinguish:
  - immediate move
  - workflow upgrade
  - long-term weakness

### Required outputs
- daily coach brief
- live advice rail
- session-specific diagnosis
- exact next prompt
- expected upgrade
- overall workflow suggestions

## Visual / Interaction Ideas
- leverage trajectory line chart with quality and amount overlays
- skill chips that show current archetype and top weaknesses
- copy-ready “send this next” blocks on each session
- “pattern suggests” callouts when memory sees stable behavior
- daily improvement deltas vs trailing 7-day baseline

## Build Phases
### Phase 1
- restore original `claude-control` monitor substrate
- Claude-generated daily coach + session coach
- coach-first UI
- expertise trajectory chart

### Phase 2
- Meta Mate adapter
- stronger long-term skill dimensions
- copy / inject next prompt into active Claude session
- workflow-specific coaching packs for writing, meetings, coding, evals

### Phase 3
- frontier playbook ingestion
- benchmark against external best practices
- more explicit “how world-class operators do this” teaching loops
