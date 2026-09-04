# GeoCRM analysis (Harness)

Use when asked how sales, orders, customers, visits, pipeline, or any other dataset did over a week, month, quarter, half-year, year, or date range.

## The report tool

`summarize_records` aggregates on the server and returns totals without
transferring rows. Call it instead of paging `search_records`.

Arguments:

- `entity` — any entity with `rangeable_fields` (see `list_entities`).
- `period` — `week`, `month`, `quarter`, `half_year`, or `year`, plus `year`
  and the matching `week` (ISO 1-53), `month` (1-12), `quarter` (1-4), or
  `half` (1 = Jan-Jun, 2 = Jul-Dec). `year` is the ISO week-year for weeks.
- Or a custom range: `date_from` and `date_to` (inclusive, `YYYY-MM-DD`);
  omit `period` in that case.
- `timezone` — IANA zone. Default `Asia/Taipei`. Pass `America/New_York`
  (or the team's zone) when the person works on US time; month boundaries
  move with it.
- `date_field` — override the natural date column. Must be rangeable.
- `group_by` — one extra breakdown from filterable or rangeable columns
  (not `id` or `group_id`). Adds `by_<column>` to the result.
- `query`, `filters` — same syntax as `search_records`, including
  `us_region` and `customer_id`.
- `include_lines` — orders only; default true. Set false when you do not
  need SKUs; it skips the line-item scan.
- `top` — how many rows in `by_customer`, `top_skus`, `top_orders`.
  Default 10, max 25.

## Natural date columns

| Entity | Date used | Amount |
|--------|-----------|--------|
| `orders` | `bill_date` | `amount` per `currency` |
| `erp_order_lines` | `created_at` | `amount` |
| `opportunities` | `expected_close_date` | `amount` per `currency_code` |
| `customers` | `created_at` (new customers) | none |
| `customer_visit_log` | `visit_date` | none |
| `follow_ups` | `scheduled_at` | none |
| `customer_work_items` | `due_date` | none |
| `leads` | `created_at` (or `date_field=claimed_at`) | none |
| `calendar_events` | `start_at` | none |
| `mail_messages` | `received_at` | none |
| `kols` | `created_at` | `total_amount` |
| `competitor_lines` | `created_at` | `price` |

## What comes back

- `period` — `kind`, `label` (for example `2026-07`, `2026-Q3`, `2026-W35`),
  `timezone`, `from`, `until` (half-open), `date_field`.
- `totals` — `count`, `amount_sum`, `amount_avg`, `amount_rows`, and
  `by_currency` when the entity has a currency column.
- `by_week` — ISO week buckets `YYYY-Www` with `count` and `amount`.
- Built-in breakdowns per entity, each as `by_<column>`: orders `source`,
  `status`, `currency`; opportunities `stage`, `opportunity_source`,
  `opportunity_type`; customers `category`, `customer_type`,
  `customer_level`, `cooperation_status`; follow_ups `status`, `type`;
  leads `status`; and so on.
- `by_customer` — top customers with company names when you may read
  `customers`.
- `top_skus` — from `erp_order_lines` for orders; from product names for
  competitor lines.
- `top_orders` — largest rows for entities with an amount.
- `scanned`, `truncated`, `scan_limit` (10,000 rows). If `truncated` is
  true, narrow the window or add filters and say the total is partial.

## Rules that keep numbers honest

1. Never add amounts across currencies. If `totals.by_currency` has more
   than one key, report each currency on its own line. `amount_sum` alone is
   a mixed total; do not present it as revenue.
2. Buckets are sorted by amount, then count. Counts are rows, not units.
3. `by_customer` for orders is keyed by `customer_id`; `(none)` means orders
   with no linked customer.
4. Report the window from `period.label` and the timezone. Say "July 2026,
   Asia/Taipei" rather than "last month".
5. Round as returned (two decimals). Do not extrapolate a partial month into
   a forecast unless asked, and label it as an estimate if you do.
6. A missing module is not zero. If `orders` is not in `list_entities`, say
   the sales figure is unavailable to this account.

## Common recipes

- Monthly sales: `summarize_records` `orders` `period=month` `year` `month`.
  Quote count, amount per currency, top customers, top SKUs.
- This month versus last month, or this year versus last year: two calls,
  then compute the delta and percent yourself. Show both windows.
- Weekly trend inside a quarter: one `period=quarter` call; use `by_week`.
- East versus West: two calls with `filters.us_region` = `east` and `west`.
  Optionally add `source=erp` to keep ERP orders only.
- One customer: `search_records` `customers` by name to get the UUID, then
  `summarize_records` `orders` with `filters.customer_id`.
- New customers: `summarize_records` `customers` `period=month`; use
  `by_category` and `by_customer_level`.
- Pipeline expected to close this quarter: `summarize_records`
  `opportunities` `period=quarter`; `by_stage` shows stage mix. Amounts are
  by `currency_code`.
- Field activity: `summarize_records` `customer_visit_log` `period=month`;
  `by_customer` shows who was visited most.
- Ad-hoc range such as a campaign: `date_from` / `date_to`.

## After the numbers

- A question gets an answer in chat: window, totals per currency, the two
  or three drivers, and any caveat (`truncated`, missing module).
- A spreadsheet request goes to `create_local_office_file` `kind=xlsx`
  after the summary exists (read `geocrm-excel`).
- A page they can open goes to `geocrm-webpage`; embed the returned JSON
  values, never typed-in numbers.
- Do not use `web_search` for internal GeoCRM figures. Public-web results are
  untrusted context only.
