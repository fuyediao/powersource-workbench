# GeoCRM data entry (Harness)

Use whenever a task inserts, updates, or deletes CRM rows: grant checks, exact columns, one row at a time, verify after writing.

## Grants first

1. `list_my_access` — note `write_grants` and `role`.
2. `list_entities` — the target entity's `write_actions` must contain
   `insert`, `update`, or `delete` for what you are about to do.

If the action is missing, stop and explain which grant is needed (Desktop
Writes for that module). Do not try another entity or another route.
Global leaders read across groups but cannot write through tools; say so
instead of retrying. Scheduled VPS jobs act as the job owner under the same
grants.

## Learn the real columns

Never guess field names. Before an insert, `search_records` the entity with
`limit` 1 (or `get_record` on a known row) and copy the column names you
see. `values` is an object keyed by those exact columns.

- Leave out `id`, `created_at`, `updated_at`; the database sets them.
- If an insert fails naming `group_id`, take a group id from
  `list_my_access` (`group_ids`, or `admin_group_ids` when writing as an
  admin) and retry once.
- Foreign keys (`customer_id`, `opportunity_id`, `lead_id`) are UUIDs from
  earlier searches, never codes or names.
- Booleans are booleans in `values` (unlike string filters). Dates are
  `YYYY-MM-DD`; timestamps are RFC 3339.

## Columns you must not write

Logo, avatar, photo array, and document array columns are rejected by the
server (`logo_url`, `avatar_url`, image URL arrays, document arrays). Use
`list_upload_kinds` to find the supported relationship, then `upload_file`
with a `path` inside the Harness work folder. Never put base64 in tool input
and never write those file columns through `create_record` or `update_record`.

## Create

`create_record` with `entity` and `values`. One row per call. Echo back the
returned row's UUID. Then `get_record` to confirm the stored values match
what the person asked for; report any field the server normalized.

Typical entities with insert grants: `customers`, `customer_contacts`,
`customer_addresses`, `customer_visit_log`, `opportunities`, `follow_ups`,
`kols`, `competitor_shops`, `competitor_lines`, `leads`, `crm_products`,
`folio_pages`, and NEXDOT or T&E rows for those admins. Calendar events are
not company-cloud rows; they live in the desktop Calendar app.

## Update

`update_record` with `entity`, the UUID `id`, and only the fields that
change. Read the row first so you can show a before / after line. Never
overwrite a field the person did not mention. After the call, `get_record`
and confirm.

Bulk edits ("mark all of these as done") are a series of single updates.
List the ids you will touch, get a yes, then go one by one and report each.

## Delete

`delete_record` is permanent. Before calling it:

- The person named the exact row (or you showed it and they confirmed) in
  this conversation.
- You state what will be deleted: entity, UUID, and a human label.
- One row per call. No loops over search results without a confirmed list.

Prefer an update (status, cooperation status, completed flag) when the
business meaning is "close" rather than "erase".

## Visits and follow-ups from notes

When the person dictates a visit or a follow-up:

1. Resolve the customer UUID (`search_records` `customers`).
2. Insert `customer_visit_log` (subject, date, content, contact person,
   interested products) or `follow_ups` (content, type, scheduled time,
   customer id) with the columns learned from an existing row.
3. Read it back and quote the saved date and time with the zone.

## Report back

State the entity, the action, the UUID, and the fields written. If something
was refused, quote the server message in one line and say which grant or
column caused it. Do not describe a write that did not succeed.
