# Workflows & Scheduler Skill Guide

Last verified: 2026-04-06

---

## Section 1: When to Use

Use workflow tools when the user says:
- "save this as a workflow", "create a reusable prompt", "save this for later"
- "run my weekly report workflow", "execute the onboarding workflow"
- "list my workflows", "show saved workflows", "what workflows do I have"
- "export/import a workflow", "share this workflow"

Use scheduler tools when the user says:
- "run this every morning at 9", "schedule a daily task", "set up a cron job"
- "every Monday, do X", "run this hourly", "schedule a recurring task"
- "list my scheduled tasks", "pause the daily report", "delete the scheduler"
- "run it now", "trigger the task immediately"

**12 tools total**: 6 workflow + 6 scheduler.

---

## Section 2: Tool Reference

### Workflow Tools

| Tool | Permission | Required Params | Optional Params | Description |
|------|-----------|----------------|----------------|-------------|
| `workflow_save` | safe | `name`, `prompt` | `description`, `tags` | Save a reusable prompt template with `{{var}}` placeholders |
| `workflow_list` | safe | (none) | `search`, `tag` | List all saved workflows, filterable by name/tag |
| `workflow_run` | sensitive | `workflowId` | `variables` | Run a saved workflow by name or ID with variable substitution |
| `workflow_delete` | sensitive | `workflowId` | (none) | Delete a workflow permanently |
| `workflow_export` | safe | `workflowId` | (none) | Export workflow as JSON string |
| `workflow_import` | sensitive | `json` | (none) | Import a workflow from JSON string |

### Scheduler Tools

| Tool | Permission | Required Params | Optional Params | Description |
|------|-----------|----------------|----------------|-------------|
| `schedule_create` | sensitive | `name`, `prompt`, `schedule` | `enabled`, `timezone`, `description` | Create a cron-scheduled task |
| `schedule_list` | safe | (none) | (none) | List all scheduled tasks with status |
| `schedule_delete` | sensitive | `taskId` | (none) | Delete a scheduled task and stop its cron job |
| `schedule_enable` | sensitive | `taskId` | (none) | Re-enable a paused task |
| `schedule_disable` | sensitive | `taskId` | (none) | Pause a task without deleting it |
| `schedule_run_now` | sensitive | `taskId` | (none) | Trigger an immediate one-off execution |

---

## Section 3: Key Concepts

### Workflow Variables

Workflows support `{{variableName}}` placeholders in the prompt template. When running a workflow, pass a `variables` object to substitute values.

- Variables are auto-extracted from the prompt on save.
- Unsubstituted variables remain as literal `{{varName}}` in the resolved prompt.
- Variable names must be word characters only: `[a-zA-Z0-9_]`.

### Cron Expressions (5-field)

The scheduler uses standard 5-field cron expressions:

```
 *    *    *    *    *
 |    |    |    |    |
 |    |    |    |    +-- day of week (0-7, 0 and 7 = Sunday)
 |    |    |    +------- month (1-12)
 |    |    +------------ day of month (1-31)
 |    +----------------- hour (0-23)
 +---------------------- minute (0-59)
```

Common patterns:
| Expression | Meaning |
|-----------|---------|
| `0 9 * * 1-5` | Weekdays at 9:00 AM |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 * * * *` | Every hour on the hour |
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 9,17 * * 1-5` | Weekdays at 9 AM and 5 PM |
| `0 0 1 * *` | First of every month at midnight |
| `30 8 * * 1-5` | Weekdays at 8:30 AM |

### Timezone

- Default timezone: `America/New_York`.
- Pass the `timezone` parameter to `schedule_create` for other timezones (e.g., `America/Los_Angeles`, `Europe/London`, `Asia/Tokyo`).
- Uses IANA timezone identifiers.

### Persistence

- Workflows are saved to `{userData}/workflows.json`. Survives app restarts.
- Scheduled tasks are saved to `{userData}/scheduled-tasks.json`. Cron jobs are re-registered on app startup.
- Workflow IDs have the format `wf_XXXXXXXX` (8-char UUID suffix).
- Scheduler task IDs have the format `sched_XXXXXXXX`.

### How Workflows and Schedules Interact

Workflows and schedules are independent but complementary:

1. **Workflow alone**: A saved prompt template that runs on demand via `workflow_run`.
2. **Schedule alone**: A cron-triggered prompt that runs the agent automatically.
3. **Combined**: Save a workflow first, then create a schedule whose `prompt` calls `workflow_run`. This lets you maintain the prompt template separately from the schedule.

The scheduler fires by sending the task's `prompt` directly to the agent core (`handleUserMessage`). It does NOT call `workflow_run` automatically -- the prompt itself can contain instructions to do anything the agent can do, including running a workflow.

---

## Section 4: Procedures

### Procedure: Create and Run a Simple Workflow

1. Save the workflow:
```
workflow_save({
  name: "daily-standup",
  prompt: "Summarize what I worked on yesterday based on my recent chat history, list today's priorities, and flag any blockers.",
  description: "Daily standup summary generator",
  tags: ["daily", "productivity"]
})
```
Returns: `{ ok: true, id: "wf_a1b2c3d4", name: "daily-standup", variables: [] }`

2. Run it anytime:
```
workflow_run({ workflowId: "daily-standup" })
```

### Procedure: Create a Parameterized Workflow

1. Save with `{{variable}}` placeholders:
```
workflow_save({
  name: "competitor-analysis",
  prompt: "Research {{company}} and provide: 1) Their latest product announcements, 2) Pricing compared to {{our_product}}, 3) Key differentiators, 4) Potential threats to our market position.",
  description: "Competitor deep-dive analysis",
  tags: ["research", "competitive"]
})
```
Returns: `{ ok: true, id: "wf_e5f6g7h8", variables: ["company", "our_product"] }`

2. Run with variable substitution:
```
workflow_run({
  workflowId: "competitor-analysis",
  variables: { "company": "Acme Corp", "our_product": "WidgetPro" }
})
```

### Procedure: Schedule a Recurring Task

1. Create the schedule:
```
schedule_create({
  name: "morning-briefing",
  prompt: "Search the web for the top 5 tech news stories today. Summarize each in 2-3 sentences. Then check my calendar for today's meetings and list them.",
  schedule: "0 8 * * 1-5",
  timezone: "America/New_York",
  description: "Weekday morning news + calendar briefing at 8 AM ET"
})
```
Returns: `{ ok: true, id: "sched_x1y2z3w4", name: "morning-briefing", schedule: "0 8 * * 1-5", enabled: true }`

2. Check status:
```
schedule_list()
```
Returns all tasks with `isRunning`, `runCount`, `lastRunAt`, `enabled` fields.

### Procedure: Schedule a Workflow

1. First, save the workflow:
```
workflow_save({
  name: "weekly-report",
  prompt: "Read the file at {{report_path}} and generate a summary with key metrics, trends, and recommendations. Save the summary to {{output_path}}.",
  tags: ["weekly", "reporting"]
})
```

2. Then create a schedule whose prompt instructs the agent to run that workflow:
```
schedule_create({
  name: "friday-weekly-report",
  prompt: "Run the workflow named 'weekly-report' with variables: report_path='/Users/me/data/metrics.xlsx', output_path='/Users/me/reports/weekly-summary.md'",
  schedule: "0 17 * * 5",
  description: "Every Friday at 5 PM: generate weekly report"
})
```

### Procedure: Pause and Resume a Schedule

1. List tasks to find the ID:
```
schedule_list()
```

2. Pause (disable) without deleting:
```
schedule_disable({ taskId: "sched_x1y2z3w4" })
```
The cron job stops but the task config is preserved.

3. Resume later:
```
schedule_enable({ taskId: "sched_x1y2z3w4" })
```
The cron job is re-registered.

### Procedure: Test a Schedule Before Committing

1. Create the schedule with `enabled: false`:
```
schedule_create({
  name: "test-task",
  prompt: "Check disk usage and report if any partition is above 80%.",
  schedule: "0 */6 * * *",
  enabled: false,
  description: "Disk check every 6 hours (paused for testing)"
})
```

2. Trigger a manual test run:
```
schedule_run_now({ taskId: "sched_abc12345" })
```

3. If the test result is satisfactory, enable it:
```
schedule_enable({ taskId: "sched_abc12345" })
```

### Procedure: Export, Share, and Import a Workflow

1. Export:
```
workflow_export({ workflowId: "competitor-analysis" })
```
Returns the full workflow as a JSON string (id, name, prompt, variables, tags, metadata).

2. Save or share the JSON (e.g., write to file, send to colleague).

3. Import on another machine:
```
workflow_import({
  json: "{\"name\":\"competitor-analysis\",\"prompt\":\"Research {{company}}...\",\"tags\":[\"research\"]}"
})
```
A new ID is generated on import. `runCount` resets to 0.

### Procedure: Find and Manage Workflows

1. List all:
```
workflow_list()
```

2. Filter by tag:
```
workflow_list({ tag: "weekly" })
```

3. Search by name/description:
```
workflow_list({ search: "report" })
```

4. Delete:
```
workflow_delete({ workflowId: "daily-standup" })
```
Accepts either the workflow name or the `wf_*` ID.

---

## Section 5: Known Issues & Gotchas

### Workflow Naming

- `workflowId` in `workflow_run`, `workflow_delete`, and `workflow_export` accepts EITHER the workflow name OR the UUID-based ID (e.g., `wf_a1b2c3d4`).
- Workflow names are not enforced as unique by the service. If you save two workflows with the same name, `get()` returns the first match. Use IDs for precision.
- Names are trimmed on save. Leading/trailing whitespace is removed.

### Variable Substitution

- Only `{{wordChars}}` patterns are recognized. `{{ spaced }}` or `{single}` will NOT be substituted.
- If a variable is not provided at runtime, the literal `{{varName}}` remains in the prompt text -- it does not error.
- Variables are extracted from the prompt on save and stored in the workflow's `variables` array.

### Scheduler Execution

- When a scheduled task fires, it calls `agentCoreRef.handleUserMessage(prompt)`. This means the task runs with the FULL agent context -- all tools are available, the current persona applies, and the result appears in the agent's message history.
- If the agent core is not available (e.g., during app startup), the task silently fails and logs an error.
- Tasks do NOT queue -- if a task is still running when the next cron tick fires, both will run concurrently. Avoid schedules more frequent than the expected task duration.

### Cron Validation

- Invalid cron expressions are rejected at create time with a descriptive error.
- The scheduler uses `node-cron` which supports 5-field expressions only (no seconds field).
- Day-of-week: 0 = Sunday, 7 = also Sunday. Both `0-6` and `1-7` ranges work.

### Persistence Across Restarts

- Workflows persist immediately on save/delete/import.
- Scheduled tasks persist immediately. On app restart, all enabled tasks are re-registered with their cron jobs.
- `runCount` and `lastRunAt` are updated and persisted each time a task executes.

### IPC Events (Scheduler)

The scheduler emits events to the renderer:
- `scheduler:task-started` -- `{ id, name, startTime }`
- `scheduler:task-completed` -- `{ id, name, duration, summary }`
- `scheduler:task-error` -- `{ id, name, error, duration }`

These can be used for UI notifications but are not currently surfaced in the chat panel.

### Timezone Pitfalls

- The default timezone is `America/New_York`, NOT the system timezone. Always specify `timezone` explicitly if the user is in a different zone.
- Timezone must be a valid IANA identifier. Common ones: `America/Los_Angeles`, `America/Chicago`, `Europe/London`, `Europe/Berlin`, `Asia/Tokyo`, `Asia/Kolkata`, `Australia/Sydney`.
- Daylight saving transitions are handled by `node-cron` automatically.
