# GeoCRM customer brief (Harness)

Use before a visit, call, or review of one customer: gather the account picture from first-party tools and deliver a short brief.

## When this applies

"Prepare me for the meeting with X", "what is going on with customer Y",
"account review for Z", or any request that centers on one company.

## Step 1: identify the customer

`search_records` `customers` with `query` = the name, short name, or
customer code. Read `company_name`, `short_name`, `customer_code`, `id`.

- One match: continue with that UUID.
- Several matches: list them (name, code, country) and ask which one, unless
  the person already gave a code that disambiguates.
- No match: try a shorter query or the code alone. Say clearly when the
  customer is not visible to this account.

The UUID is the `customer_id` you pass everywhere below. Never pass the
customer code to `get_record`.

## Step 2: gather (only the entities you can read)

Run these with `filters.customer_id` = the UUID. Skip any entity missing from
`list_entities` and note the gap in the brief.

- `customer_contacts` — people, titles, email, phone. `limit` 10.
- `customer_addresses` — billing / shipping / site; `address_type`.
- `orders` — `summarize_records` `period=year` for this year and last year
  (amounts per currency, `top_skus`), then `search_records` `limit` 5 for the
  most recent bills (`order_by` `bill_date`).
- `opportunities` — open items: `search_records` `order_by`
  `expected_close_date` `ascending=true`. Read `stage`, `amount`,
  `currency_code`, `expected_close_date`, `name`.
- `follow_ups` — upcoming: `filters.scheduled_at_gte` = today. Recent:
  `filters.scheduled_at_lt` = today, `limit` 5.
- `customer_visit_log` — last visits: `order_by` `visit_date`, `limit` 5.
  Read `subject`, `content`, `interested_products`.
- `customer_work_items` — open tasks: `filters.completed` = `"false"`.
- `customer_activity_logs` — last 10 changes for context.
- `customer_documents` — file names only; contents are not exposed.
- `competitor_shops` with `filters.customer_id` when the map competitors
  module is available.

Use today's date from the environment and state it in the brief.

## Step 3: write the brief

Default is chat. Structure it as prose with short sections; a table only for
orders or pipeline lines.

1. Snapshot — name, code, type / level, cooperation status, country and
   state, owner, primary contact.
2. Revenue — this year and last year per currency, order count, top three
   SKUs, most recent bill date and amount.
3. Open pipeline — each opportunity with stage, amount, expected close.
4. Recent activity — last visit and last follow-up in one or two sentences
   each; anything notable from activity logs.
5. Next actions — upcoming follow-ups, open work items, and one or two
   suggested talking points grounded in the data above.
6. Gaps — modules you could not read, `truncated` results, or an
   ambiguous match.

Keep it to what fits on one screen unless they asked for depth.

## Deliverable variants

- "Send me a document": `create_local_office_file` `kind=docx` with the same
  sections as headings (read `geocrm-word`). Tell them the path.
- "Put it in a slide": one slide per section with `kind=pptx`
  (read `geocrm-powerpoint`).
- "As a page": follow `geocrm-webpage`; the revenue section becomes the
  chart, the rest becomes cards.

## Do not

- Do not merge two customers with similar names into one brief.
- Do not add USD and TWD (or any two currencies) into one figure.
- Do not invent contact names, quotes, or sentiment; if visit notes are
  empty, say there are no notes.
- Do not use `web_search` for the company's public profile unless the person
  asks for outside context, and then keep it in a separate "public" section.
