# Feature Ideas

> These are brainstormed ideas, not commitments. Nothing here is planned or scheduled — it's a collection of directions worth exploring.

## High Value

### Session Timeline / Activity Graph
A small sparkline or heatmap on each card showing message density over the last 30-60 minutes. JSONL timestamps are already available — plotting them would instantly communicate "grinding for an hour" vs "one message 40 min ago." Tiny visual, huge information density.

### Session Filtering & Search
Filter bar with status toggles (show only Working / Waiting) and text search across repo name, branch, and task title. Could be as simple as pill buttons above the grid. Becomes important as session count grows.

### Cost / Token Tracking
JSONL files contain token usage data. Show estimated cost per session and a daily total in the header. Already reading the JSONL — extracting `usage` blocks is straightforward.

### Session History
Finished sessions vanish immediately. A collapsible "Recently Finished" section (last 24h) at the bottom would let you review what completed overnight and reopen conversation details. Could read from `~/.claude/history.jsonl` or persist a small local cache.

### Bulk Actions
"Approve all pending tool uses," "Open all PRs in browser," "Kill all idle sessions." A select-multiple mode (checkboxes or Shift+click) with a floating action bar.

## Medium Value

### Session Pinning / Ordering
Pin important sessions to the top, or sort by status (waiting first, then working, then idle). Surfaces "needs attention" sessions without scanning the full grid.

### Notification Customization
Different sounds per event type — finishing vs waiting for approval. Filter notifications to specific repos only.

### PR Diff Preview
Mini diff stat (files changed, +/- lines) on the PR badge, or a hover card with PR description. Saves a browser switch.

### Session Notes / Annotations
Small text field per card for context like "waiting on API review" or "do NOT merge until staging tested." Persisted to config. Useful when juggling many parallel tasks.

### Terminal Output Streaming
Live tail of actual terminal output (last 10-20 lines) instead of just the last message preview. Seeing real-time build output and test results without switching to iTerm. Technically harder — needs pty reading or stdout piping.

## Nice to Have

### Grouped PR Dashboard View
Dedicated "PRs" tab showing all open PRs across sessions in a table — status, checks, reviews, age. A mini PR dashboard without leaving the app.

### Session Duration Display
Show how long each session has been running ("42m", "3h 12m"). `startedAt` already exists — just format the delta.

### Drag-and-Drop Card Reordering
Manually arrange cards in the grid. Persist order to config.

### Menu Bar Mode
macOS menu bar icon with active/waiting session count and a dropdown for quick access. Lighter than the full window for a quick glance.

### Webhook / Automation Hooks
Fire a webhook or run a shell command on session state transitions. Auto-merge PRs when checks pass, auto-assign reviewers, trigger downstream pipelines.
