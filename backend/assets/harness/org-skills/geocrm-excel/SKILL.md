# GeoCRM Excel workbooks (Harness)

Use for spreadsheets: read cells and formulas, patch a copy of a workbook, or build a new .xlsx from CRM results with formulas and a styled header.

## Tools

- `inspect_local_office_file` `{ path, sheet? }` — returns `sheets[]` with
  `name`, `rowCount`, `columnCount`, and `cells[]` (`address`, `value` or
  `formula` plus `result`). Cells stop after 500 items (`truncated`), so
  pass `sheet` to focus on one worksheet in a large workbook.
- `edit_local_office_file` `{ path, operations[], outputPath? }` — writes a
  new `.xlsx`; the source is untouched.
- `create_local_office_file` `{ kind: "xlsx", name?, outputPath?, content }`.

Output stays inside the work folder (default `office-output/<name>`) with
the `.xlsx` extension. Never unzip the workbook or edit its XML by hand.

## Create: content shape

```json
{
  "sheets": [
    {
      "name": "Summary",
      "header": true,
      "rows": [
        ["Metric", "Value", "Currency"],
        ["Orders", 132, ""],
        ["Amount", 48200.5, "USD"],
        ["Amount", 1520000, "TWD"]
      ]
    },
    {
      "name": "By customer",
      "header": true,
      "rows": [
        ["Customer", "Orders", "Amount (USD)"],
        ["Acme", 12, 18200],
        ["Beta", 9, 9400],
        ["Total", "", ""]
      ],
      "formulas": { "B4": "SUM(B2:B3)", "C4": "SUM(C2:C3)" }
    }
  ]
}
```

- `rows` is an array of arrays; row 1 is the header when `header: true`
  (bold white text on a dark blue fill).
- Numbers must be JSON numbers, not strings, or Excel treats them as text
  and formulas ignore them.
- `formulas` maps a cell address to a formula without the leading `=`.
  Formulas are applied after `rows`, so leave the target cell empty or put a
  placeholder.
- Dates arrive as text; use `YYYY-MM-DD` so sorting works.
- Column widths are sized from content automatically (max 50).
- One sheet per topic: `Summary`, `By week`, `By customer`, `Top SKUs`,
  `Detail`.

## Edit: operations

All operations take an optional `sheet` (defaults to the first worksheet).

- `setCell` `{ sheet?, cell, value }` — string, number, boolean, or null.
- `setCell` `{ sheet?, cell, formula }` or `setFormula` `{ sheet?, cell, formula }`
  — formula without `=`.
- `clearCell` `{ sheet?, cell }`.
- `addSheet` `{ name }`.
- `renameSheet` `{ sheet, newName }`.

Unsupported: inserting or deleting rows and columns, merged cells, charts,
conditional formatting, pivot tables. Offer to rebuild the sheet with
`create_local_office_file` instead.

## From CRM data to a workbook

1. `summarize_records` (read `geocrm-analysis`) for the window; keep the
   JSON.
2. `Summary` sheet: `period.label`, timezone, `totals.count`, one row per
   currency from `totals.by_currency`, `scanned`, `truncated`.
3. `By week` sheet from `by_week` (`key`, `count`, `amount`).
4. `By customer` sheet from `by_customer` (`label`, `count`, `amount`), plus
   a SUM row via `formulas`.
5. `Top SKUs` sheet from `top_skus` when present.
6. `Detail` sheet from `search_records` rows when the person wants
   line-level data; keep it to what they asked for, not every column.

Never sum different currencies into one cell. If two currencies exist,
either separate sheets or a Currency column with per-currency totals.

## Reading a workbook the person sent

Inspect the sheet, then answer from `value` and `result` fields. Quote cell
addresses when you point at a problem ("C14 is text, not a number"). For
totals, prefer the workbook's own formula results over recomputing, and say
when they differ from CRM data.

## Report back

Output path, sheet names, and the data window. Mention any cell you had to
leave as text or any formula you could not express.
