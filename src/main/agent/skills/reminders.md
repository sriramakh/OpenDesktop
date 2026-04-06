# Reminders Skill Guide

Use these 3 tools to schedule, list, and cancel native OS notification reminders.
Reminders fire as macOS notifications even when the app is in the background.

---

## Tool Reference

| Tool | Purpose | Required Params | Optional Params | Permission |
|---|---|---|---|---|
| `reminder_set` | Schedule a reminder at a specific time | `message`, `at` | -- | safe |
| `reminder_list` | List pending, fired, or all reminders | -- | `status` | safe |
| `reminder_cancel` | Cancel a pending reminder by ID | `id` | -- | safe |

---

## Procedure: Set a Reminder

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | The text to display in the notification |
| `at` | string | yes | When to fire -- ISO 8601, relative, or natural language |

### Time Format Reference

The `at` parameter accepts three formats, tried in this order:

#### 1. ISO 8601 (most reliable -- prefer this when the agent can compute it)

```
"2026-04-03T20:00:00"       --> 8:00 PM on April 3, 2026
"2026-04-05T09:30:00"       --> 9:30 AM on April 5, 2026
```

#### 2. Relative time

```
"in 5 minutes"              --> 5 minutes from now
"in 30 minutes"             --> 30 minutes from now
"in 2 hours"                --> 2 hours from now
"in 1 hour 30 minutes"      --> 1.5 hours from now
"in 1 day"                  --> 24 hours from now
"in 2.5 hours"              --> 2 hours 30 minutes from now
```

Accepted units: `minute`/`min`/`minutes`, `hour`/`hr`/`hours`, `day`/`days`.

#### 3. Natural language (day + time)

**Time-only (today or auto-advances to tomorrow if past):**
```
"8pm"                       --> 8:00 PM today (or tomorrow if already past 8 PM)
"8:30am"                    --> 8:30 AM today (or tomorrow if past)
"noon"                      --> 12:00 PM today (or tomorrow if past)
"midnight"                  --> 12:00 AM (advances to tomorrow/next day)
"20:00"                     --> 8:00 PM (24-hour format)
```

**Day anchors:**
```
"tomorrow at 9am"           --> 9:00 AM tomorrow
"tomorrow at noon"          --> 12:00 PM tomorrow
"friday at 6pm"             --> 6:00 PM next Friday
"monday at 8:30am"          --> 8:30 AM next Monday
"wednesday at 14:00"        --> 2:00 PM next Wednesday
```

Day names always resolve to the NEXT occurrence. If today is Thursday and you say
"thursday at 5pm", it schedules for next Thursday (7 days out), not today.

### Auto-Advance Rule

If the computed time is in the past and no explicit day was given (no "tomorrow",
no weekday name), the time automatically advances to the next day.

Example: At 10 PM, `"8pm"` becomes 8 PM tomorrow.

### Success Response

```
Reminder set
ID: rem_1712188800000_a3k9x
Message: "Call the dentist"
Fires: Thu, Apr 3, 8:00 PM (in 2h 15m)
```

The delay is shown in a human-readable format: minutes, hours+minutes, or days+hours.

### Examples

**Simple relative reminder:**
```
reminder_set({
  message: "Stand up and stretch",
  at: "in 30 minutes"
})
```

**Specific time tomorrow:**
```
reminder_set({
  message: "Submit the expense report",
  at: "tomorrow at 9am"
})
```

**ISO 8601 for precision:**
```
reminder_set({
  message: "Join the team call",
  at: "2026-04-03T14:00:00"
})
```

**Weekday reminder:**
```
reminder_set({
  message: "Send weekly status update",
  at: "friday at 5pm"
})
```

---

## Procedure: List Reminders

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | enum | no | `"pending"` | `"pending"` for upcoming only, `"all"` for all including fired/cancelled |

### Examples

**List pending reminders (default):**
```
reminder_list({})
```

**List everything:**
```
reminder_list({ status: "all" })
```

### Response Format

```
[rem_1712188800000_a3k9x] "Call the dentist" -- Thu, Apr 3, 8:00 PM (in 45 min)
[rem_1712275200000_b7m2p] "Submit report" -- Fri, Apr 4, 9:00 AM (in 13h 15m)
```

Each line shows: `[ID] "message" -- formatted time (status or time remaining)`.

- Pending reminders show time remaining (e.g., "in 45 min").
- Fired reminders show "fired".
- Cancelled reminders show "cancelled".
- Pending reminders are sorted by fire time (soonest first).
- All reminders are sorted by creation time (newest first), capped at 50.

---

## Procedure: Cancel a Reminder

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | The reminder ID (e.g. `"rem_1712188800000_a3k9x"`) |

### Workflow

1. Call `reminder_list({})` to find the ID of the reminder to cancel.
2. Call `reminder_cancel({ id: "rem_..." })`.

### Example

```
reminder_cancel({ id: "rem_1712188800000_a3k9x" })
--> Reminder "rem_1712188800000_a3k9x" cancelled.
```

Errors:
- If the ID does not exist or the reminder already fired/was cancelled:
  `No pending reminder found with ID: rem_...`

---

## How Reminders Fire

### Storage

- Reminders are stored in `{userData}/reminders.json` (not SQLite).
- They persist across app restarts.
- The in-memory array is the source of truth; disk is synced on every add/cancel/fire.

### Polling

- A timer checks every 30 seconds for due reminders.
- On app startup, an initial check runs after 3 seconds (catches reminders that were due during downtime).

### Notification

When a reminder fires:

1. Status changes from `"pending"` to `"fired"`.
2. A native macOS notification appears with title "OpenDesktop Reminder" and the message as body.
3. Clicking the notification focuses the OpenDesktop window.
4. An IPC event `reminder:fired` is sent to the renderer.
5. The chat UI shows an amber Bell card with the reminder message and fire time.

### Important: Polling Granularity

Because polling occurs every 30 seconds, a reminder may fire up to 30 seconds late.
This is by design. For time-critical scheduling (to-the-second precision), reminders
are not the right tool.

---

## Common Workflows

### "Remind me in 30 minutes to check the build"

```
reminder_set({
  message: "Check the build status",
  at: "in 30 minutes"
})
```

### "Set a reminder for tomorrow morning to review PRs"

```
reminder_set({
  message: "Review open pull requests",
  at: "tomorrow at 9am"
})
```

### "What reminders do I have?"

```
reminder_list({})
```

### "Cancel that reminder"

```
1. reminder_list({})               --> find the ID
2. reminder_cancel({ id: "rem_..." })
```

### "Remind me every day at 5pm to log hours" (manual recurrence)

There is no built-in recurrence. Set one reminder at a time. When it fires, the user
can ask to set the next one.

---

## Known Issues & Gotchas

1. **No recurrence**: Reminders are one-shot. There is no "repeat daily" option. For recurring reminders, the user must set a new one each time.

2. **Time zone**: All times are in the system's local timezone. ISO 8601 strings without a timezone offset are interpreted as local time.

3. **Past-time rejection**: If the computed fire time is in the past (after auto-advance logic), the tool throws an error: "Computed fire time is in the past." This can happen with explicit ISO dates in the past.

4. **Parsing ambiguity**: `"8pm"` at 7:59 PM fires in 1 minute (today). `"8pm"` at 8:01 PM auto-advances to tomorrow. This is intentional but can surprise users.

5. **App must be running**: Reminders only fire while OpenDesktop is running. If the app is quit, pending reminders will fire on next launch (the 3-second startup check catches overdue ones).

6. **30-second granularity**: The polling interval is 30 seconds. A reminder set for "in 1 minute" may fire anywhere between 30 and 90 seconds from now.

7. **Weekday parsing always goes forward**: "friday at 6pm" on a Friday at 5 PM does NOT schedule for today (1 hour from now). It schedules for next Friday (7 days out). This is because `diff <= 0` advances by 7 days. Use `"6pm"` (no weekday) to get today instead.

8. **ID format**: IDs look like `rem_1712188800000_a3k9x` (timestamp + random suffix). They are auto-generated and should not be manually constructed.

---

Last verified: 2026-04-06
