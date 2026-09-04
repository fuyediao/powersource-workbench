# GeoCRM scheduled tasks (Harness)

Use when asked to run something daily or weekly, or when this turn is itself a scheduled run: what the scheduler can do and how to finish a wake turn.

## What exists

Recurring jobs live in the Harness Scheduled page, one list per user, stored
as `harness/jobs.json` on the VPS profile. There is no first-party tool that
creates or edits jobs. When someone asks you to "schedule this", explain how
to create it there and suggest the exact prompt text; do not claim you
scheduled it.

A job has:

- `name` and `prompt` (what to do).
- `schedule.kind` `daily`, `weekdays`, or `weekly` with `days` (`mon` to
  `sun`), `time` as 24-hour `HH:MM`, optional IANA `timeZone`.
- `target` `vps` or `thisPc`.

Jobs can be paused, resumed, triggered now, or deleted from the same page.

## target = vps

Runs on the server while the laptop is closed, acting as the job owner with
the same group isolation and write grants. It does not run a model turn.
It builds an office digest:

1. `list_my_access`.
2. `summarize_records` with `period=week` for the current ISO week on the
   entities the prompt names.

Entity selection is by keyword in the prompt:

| Prompt contains | Entity summarized |
|-----------------|-------------------|
| follow | `follow_ups` |
| work, task | `customer_work_items` |
| opportunit, pipeline | `opportunities` |
| order, sales, erp | `orders` |
| customer | `customers` |
| none of the above | `customers` |

Mail and Calendar live on this PC. A VPS job cannot search inboxes or
agendas. Use `target=thisPc` when the prompt needs local Mail or Calendar.

The digest is stored as the job's last result and shown in the Scheduled
page. It cannot write files, edit Office documents, or search the web.

Wording a VPS prompt: include the keywords you want summarized ("weekly
orders and pipeline digest"). Anything else in the prompt is kept for the
person to read but does not change what runs.

## target = thisPc

Waits until the person's Electron client is online, then starts a local
Codex turn with the job's prompt in the Harness work folder. That turn has
the full tool set: first-party CRM tools, Office tools, file writes, and
web search if the toggle is on. Use this target for anything that produces a
file, a page, or an edited document.

## When this turn is a scheduled run

You will see the job prompt as the user message, usually with no one
watching.

- Do the task end to end; do not ask clarifying questions. Make the safest
  reasonable assumption and state it in the summary.
- Write deliverables under the work folder with a dated name
  (`reports/2026-W36-pipeline.xlsx`, `reports/2026-09-02-orders.html`).
- Do not perform destructive writes (`delete_record`) from a scheduled run.
  Inserts and updates only when the prompt explicitly asks and the grant
  exists.
- Finish with a short summary: what ran, the window, the paths written, and
  anything that failed. The person reads this later.

## Suggesting a job

When the person describes a recurring need, propose:

- Name: short and specific ("Monday pipeline review").
- Prompt: the task in one or two sentences, with the keywords above if the
  target is `vps`, or the full instruction (including output format) if the
  target is `thisPc`.
- Schedule: kind, days, time, and their timezone.
- Target: `vps` for a read-only weekly digest; `thisPc` for files, pages, or
  Office documents.

Then say they can create it in the Scheduled page and trigger it once to
check the result.

## Do not

- Do not say a job was created, paused, or run unless the person did it in
  the UI.
- Do not describe VPS digests as documents or dashboards; they are text.
- Do not promise a `thisPc` job will run at the exact minute; it waits for
  the machine to be online.
