# Workbench mail and calendar (Harness)

Mail and Calendar live on this PC (Electron SQLite and local attachment
files). They are not company-cloud tables. Do not call `search_records`,
`get_record`, `count_records`, `summarize_records`, `create_record`,
`update_record`, or `delete_record` for mail or calendar. Those entity
keys are not in `list_entities`.

## Mail: send or draft

`send_mail` and `save_mail_draft` run in Electron against the signed-in
user's local mailbox. The VPS always refuses them.

- `send_mail` pauses for an on-device confirmation card. Never claim the
  message was sent until this tool returns `ok`.
- `save_mail_draft` writes a reviewable draft in the local Mail database.
  Report the returned draft id.

Write the draft in chat, in the language of the original message unless
told otherwise. Include a subject line, greeting, body, and sign-off with
the person's name from `list_my_access` context or `team_profiles`. Keep
facts to what the thread and CRM records say.

`mailAccountId` is the local mailbox id on this PC, not a cloud UUID.

If the Mail module is not enabled, say so. Do not invent another path.

## Calendar

There is no first-party tool that lists or writes calendar events. Ask the
person to open Calendar on this PC, or to describe the event they want so
you can draft text they can paste there.

## Cross-checks worth doing

- Meeting tomorrow with a customer: run `geocrm-customer-brief` for them.
- Unread mail from a customer with an open opportunity: mention the
  opportunity stage from `opportunities` if that entity is granted.
- Follow-up due this week with no calendar slot: point it out; do not book
  it unless asked.

## Do not

- Do not quote entire email bodies back; summarize and cite the sender and
  date.
- Do not mark messages read, move, or delete mail; no cloud tool does that.
- Do not bypass or pre-answer the native approval card for `send_mail`.
- Do not tell the person that mail or calendar rows live in Supabase.
