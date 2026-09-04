# GeoCRM mail and calendar (Harness)

Use for inbox triage, reading one message, drafting a reply, and answering what is on the calendar for a day or week.

## Scope and limits

- Mail entities are the caller's own mailboxes only (`mail_accounts` is
  self-scoped). Colleagues' mail is never visible.
- `send_mail` sends only after the desktop shows a confirmation card and the
  person approves it. `save_mail_draft` stores a reviewable draft without
  sending. Both are limited to mailboxes owned by the caller.
- Calendar rows are personal plus group calendars the caller may read.

Both modules must appear in `list_entities` (`desktop_mail`,
`desktop_calendar`). If not, say the module is not enabled for this account.

## Mail: triage

1. `search_records` `mail_accounts` — get account ids and display names.
2. `search_records` `mail_messages` with `filters.mail_account_id`,
   `filters.is_read` = `"false"`, optional `filters.received_at_gte` =
   today minus 7 days, `order_by` `received_at`, `limit` 25.
3. Group by sender or subject in your answer. Flag messages whose subject or
   snippet mentions a customer you can match in `customers`.
4. Volume over time: `summarize_records` `mail_messages` `period=week` with
   `by_is_read` and `by_is_sent`.

Fields you will see: `subject`, `snippet`, `from_address`, `from_name`,
`received_at`, `is_read`, `is_sent`, `is_draft`, `thread_id`, `folder_id`.

## Mail: read one message

`search_records` `mail_message_bodies` with `filters.message_id` = the
message UUID, `limit` 1. Prefer `body_text`; fall back to `body_html` only
when text is empty. Fetch one body at a time; HTML bodies can be large.

Thread context: `search_records` `mail_messages` with `filters.thread_id`,
`order_by` `received_at` `ascending=true`.

## Mail: draft or send a reply

Write the draft in chat, in the language of the original message unless
told otherwise. Include a subject line, greeting, body, and sign-off with
the person's name from `list_my_access` context or `team_profiles`. Keep
facts to what the thread and CRM records say. When the person asks to review
it in Mail, call `save_mail_draft` and report the returned draft id. When they
explicitly ask to send, call `send_mail`; the native approval card is the last
confirmation. Never claim a message was sent until the tool returns `ok`.

## Calendar: what is on

1. `search_records` `calendars` — names and ids.
2. `search_records` `calendar_events` with `filters.start_at_gte` = start of
   the window and `filters.start_at_lt` = end of the window, `order_by`
   `start_at` `ascending=true`, `limit` 50.
3. Present as a day-by-day list: time (or "all day"), title, calendar name,
   description in one line. Convert to the person's timezone if the rows
   are in UTC; say which zone you used.

Busy weeks: `summarize_records` `calendar_events` `period=week` shows counts
by `by_all_day`.

## Calendar: creating an event

Only when `write_actions` on `calendar_events` includes `insert`. Read one
existing event first (`search_records` `limit` 1) to learn the exact column
names, then `create_record` with those columns (title, start, end, all-day
flag, calendar id, description). Confirm the time zone with the person if
the request is ambiguous. Re-read the row with `get_record` and report the
UUID. Details in `geocrm-data-entry`.

## Cross-checks worth doing

- Meeting tomorrow with a customer: run `geocrm-customer-brief` for them.
- Unread mail from a customer with an open opportunity: mention the
  opportunity stage from `opportunities`.
- Follow-up due this week with no calendar slot: point it out; do not book
  it unless asked.

## Do not

- Do not quote entire email bodies back; summarize and cite the sender and
  date.
- Do not mark messages read, move, or delete mail; no tool does that.
- Do not bypass or pre-answer the native approval card for `send_mail`.
