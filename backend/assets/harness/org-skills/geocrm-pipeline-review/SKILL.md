# GeoCRM pipeline review (Harness)

Use for weekly sales hygiene: stage mix, stale opportunities, overdue follow-ups, idle leads, and open work items.

## When this applies

"Review my pipeline", "what is overdue", "what should the team chase this
week", "clean up the funnel", or a scheduled weekly review.

## Step 0: the date

Read today's date from the environment. Every "overdue" comparison below
uses it; print it at the top of the review.

## Step 1: stage mix

`summarize_records` `opportunities` `period=quarter` with the current
`year` and `quarter`. Read `by_stage`, `totals.by_currency`, `by_customer`.
Stage names are whatever the team uses; read them from `by_stage` and never
assume a fixed list.

Repeat with `period=month` when they want a tighter view, or two quarters
when they want movement.

## Step 2: stale opportunities

`search_records` `opportunities` with `filters.expected_close_date_lt` =
today, `order_by` `expected_close_date` `ascending=true`, `limit` 25.

Exclude rows whose `stage` is clearly terminal (won, lost, closed) after you
have seen the actual stage values in Step 1. List the rest as "past expected
close": name, customer, stage, amount with currency, days overdue.

## Step 3: overdue follow-ups

`search_records` `follow_ups` with `filters.scheduled_at_lt` = today,
`order_by` `scheduled_at` `ascending=true`, `limit` 25.

Drop rows whose `status` marks completion or whose `completed_at` is set.
For each remaining row show content, type, owner, customer, and how many
days late. `summarize_records` `follow_ups` `period=week` gives the week's
load by `by_status` and `by_type`.

## Step 4: idle leads (when `leads` is readable)

- New leads this month: `summarize_records` `leads` `period=month`,
  `by_status`.
- Claimed but quiet: `search_records` `leads` with
  `filters.last_contact_date_lt` = today minus 14 days, `order_by`
  `last_contact_date` `ascending=true`. Mention the owner.
- Converted leads carry `customer_id`.

## Step 5: open work items

`search_records` `customer_work_items` with `filters.completed` = `"false"`
and `filters.due_date_lt` = today. Show subject, assignee, customer, due
date, importance.

## Step 6: deliver

Chat by default, one short section per step, each with two to five lines
and a table when there are rows to list. End with a "this week" list of the
five most urgent items across all sections.

Spreadsheet requested: `create_local_office_file` `kind=xlsx` with one sheet
per step (`Stage mix`, `Stale opportunities`, `Overdue follow-ups`,
`Idle leads`, `Open work items`) and `header: true` (read `geocrm-excel`).

Page requested: follow `geocrm-webpage`; stage mix becomes the chart, the
lists become tables.

## Rules

- Filter values are strings; booleans are `"true"` / `"false"`; dates are
  `YYYY-MM-DD`.
- Amounts per currency; never combine `currency_code` groups.
- Counts are rows. Say "25 shown of N" when `count_records` says there are
  more than the page.
- You may read across the team only as far as the account allows. A group
  admin sees the group; a member may see less. Say who the review covers.
- Do not change stages, close follow-ups, or reassign anything unless the
  person asks and `write_actions` allows it (read `geocrm-data-entry`).
