# GeoCRM PowerPoint decks (Harness)

Use for slide decks: read slide text, swap text in a copy of a deck, or build a clean 16:9 deck from CRM results.

## Tools

- `inspect_local_office_file` `{ path }` — returns `slideCount` and
  `slides[]` with `index` (1-based) and the visible `text` of each slide.
- `edit_local_office_file` `{ path, operations[], outputPath? }` — writes a
  new `.pptx`; the source stays untouched.
- `create_local_office_file` `{ kind: "pptx", name?, outputPath?, content }`.

Output stays inside the work folder (default `office-output/<name>`) with the
`.pptx` extension. Do not unzip the package or edit slide XML by hand.

## Create: content shape

```json
{
  "title": "Q3 2026 Sales Review",
  "subject": "Orders and pipeline, Asia/Taipei",
  "slides": [
    { "title": "Q3 2026 Sales Review", "body": "Orders, customers, pipeline\nPrepared 2026-09-02" },
    { "title": "Headline numbers", "body": "132 orders\nUSD 48,200.50\nTWD 1,520,000\nAverage order USD 365" },
    { "title": "Top customers", "body": "Acme - 12 orders - USD 18,200\nBeta - 9 orders - USD 9,400\nGamma - 7 orders - USD 6,100" },
    { "title": "Next steps", "body": "Chase 4 stale opportunities\nBook Q4 visits for East territory", "background": "EEF4FF" }
  ]
}
```

- Every slide has one title (28 pt) and one body text box (18 pt). The body
  is a single string; separate lines with `\n`. Keep three to seven short
  lines per slide.
- `background` is a hex color without `#` (default light gray `F7F9FC`).
- Layout is wide 16:9. There are no images, charts, tables, or speaker
  notes; represent a table as aligned lines ("Acme - 12 - USD 18,200") or
  move detail into an Excel file (read `geocrm-excel`).
- Deck-level `title` and `subject` go into document properties.

## Edit: operations

Only `replaceText` `{ search, replacement, all? }`. It matches visible text
across runs on every slide. `all` defaults to true; `false` replaces the
first occurrence found in slide order.

Unsupported: adding or removing slides, moving shapes, changing fonts or
colors in an existing deck. Offer a fresh deck built with
`create_local_office_file` when the change is structural.

## Deck outline from CRM data

1. Title slide: topic, window from `period.label`, timezone, date prepared.
2. Headline numbers: count, amount per currency, average.
3. Trend: the strongest and weakest ISO weeks from `by_week`.
4. Top customers from `by_customer` (labels are company names).
5. Top SKUs from `top_skus` for orders.
6. Pipeline or next steps from `opportunities` and `follow_ups`
   (read `geocrm-pipeline-review`).
7. Caveats: `truncated`, missing modules, mixed currencies.

One idea per slide. Numbers with their currency and window on the slide
itself, not only in the title.

## Reading a deck the person sent

Inspect, then answer from slide text. Cite slides by number ("slide 4 says
Q2, the data shows Q3"). You cannot see images or charts; say so when the
question depends on them.

## Report back

Output path, slide count, and the window covered. Mention anything that
would not fit the title-and-body format.
