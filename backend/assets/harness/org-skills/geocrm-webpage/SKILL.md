# GeoCRM webpage (Harness)

Use when the person wants a page, dashboard, or interactive report they can open, or Canvas mode is on. Write real HTML, not a chat outline.

## When this applies

"Show me a webpage", "make a dashboard", "I want to see it as a page",
"open it in Canvas", or Canvas mode is on for the turn. Ordinary software
work on an existing repository (components, scripts, fixes) also stays in
scope; follow that project's conventions instead of this skill's skeleton.

## Data first

If the page shows GeoCRM numbers, get them with first-party tools before you
write a single line of HTML: `list_my_access`, `list_entities`, then
`summarize_records` or `search_records` (read `geocrm-analysis`). Copy the
tool output into the page as data. Do not type figures from memory and do
not invent customers, amounts, or dates.

Record the window and the timezone from the tool result; they belong on the
page.

## Where to write

- Canvas mode on: write the primary deliverable to `canvas/index.html`
  under the work folder. Exactly one file, all CSS and JavaScript inline.
  The preview loads the file as an inline document, so relative paths to
  images, scripts, or stylesheets do not resolve. Do not write the
  deliverable anywhere else.
- Canvas mode off: write a single self-contained HTML file inside the work
  folder (for example `reports/2026-07-sales.html`) and tell them the exact
  path.
- No CDN or external script tags. The sandbox has no network, and the
  preview may not either. Draw charts with inline SVG or the `<canvas>` 2D
  API; both need no library.

After writing, reply with a short confirmation that names the path, the data
window, and anything left out.

## Page structure that works

1. Title, subtitle with the data window and timezone, and the generation
   date.
2. Three to five KPI tiles (count, total per currency, average, top
   customer). One currency per tile; never sum across currencies.
3. One trend chart from `by_week` or a two-window comparison.
4. One breakdown chart or table (`by_customer`, `top_skus`, `by_stage`).
5. A detail table with the rows that support the charts.
6. A footer that states the source tool and any `truncated` flag.

Keep the data in one `const DATA = {...}` block near the top of the script
so the person can see exactly what the page is built from.

## Minimal skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orders - July 2026</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 24px; max-width: 1100px; margin-inline: auto; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .tile { padding: 14px 16px; border: 1px solid #8884; border-radius: 10px; }
  .tile b { display: block; font-size: 1.5rem; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #8883; text-align: left; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>Orders - July 2026</h1>
<p class="sub">Window 2026-07-01 to 2026-07-31, Asia/Taipei. Source: summarize_records orders.</p>
<section class="tiles" id="tiles"></section>
<svg id="trend" viewBox="0 0 800 240" width="100%" role="img" aria-label="Amount by ISO week"></svg>
<table id="customers"></table>
<script>
const DATA = { /* paste the summarize_records JSON here */ };
// Build tiles, the SVG bars from DATA.by_week, and the table from DATA.by_customer.
</script>
</body>
</html>
```

Adapt freely; the point is one file, inline assets, data from tools.

## Charts without a library

- Bars: one `<rect>` per bucket; height = value / max * chart height.
- Lines: one `<polyline>` with computed points.
- Axis labels: `<text>` elements; format numbers with
  `Intl.NumberFormat`.
- Colors: pick from a small fixed palette; do not rely on random colors.
- Respect light and dark: `color-scheme: light dark` plus translucent
  borders (`#8884`) keeps both readable.

## Quality bar

- Readable at 1100 px wide and on a narrow window.
- Every number on the page traces back to a tool field.
- Currency shown next to every amount.
- No placeholder text such as "lorem" or "TODO" left in the file.
- If a module was unavailable, leave that section out and say so in the
  footer instead of faking it.

## When it is application code instead

If they ask for a component, a fix, or a page inside an existing project,
work in that repository: read the surrounding files, match its framework,
lint, and follow its `AGENTS.md`. Use the skeleton above only for
standalone deliverables.
