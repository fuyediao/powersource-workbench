# GeoCRM Word documents (Harness)

Use for reports, proposals, meeting minutes, letters, and filling a .docx template: inspect, edit a copy, or create from structured JSON.

## Tools

- `inspect_local_office_file` `{ path }` — returns `paragraphs[]` with
  `index`, `style` (Word style id such as `Heading1`), and `text`;
  `paragraphCount`; `truncated` after 500 paragraphs.
- `edit_local_office_file` `{ path, operations[], outputPath? }` — writes a
  new `.docx`; the source is never modified.
- `create_local_office_file` `{ kind: "docx", name?, outputPath?, content }`.

Paths may be absolute or relative to the Harness work folder. Output must
stay inside the work folder and keep the `.docx` extension; the default is
`office-output/<name>`. Files over 50 MiB are refused. Never unzip OOXML by
hand or edit `document.xml` in the shell.

## Create: content shape

```json
{
  "paragraphs": [
    { "text": "Q3 2026 Sales Review", "heading": "TITLE" },
    { "text": "Summary", "heading": "HEADING_1" },
    { "text": "Orders grew 12% quarter over quarter.", "bold": false },
    "Plain strings are paragraphs too.",
    { "text": "Top customers", "heading": "HEADING_2" }
  ],
  "tables": [
    { "rows": [["Customer", "Orders", "Amount (USD)"], ["Acme", 12, 48200.5]] }
  ]
}
```

- `heading` accepts `TITLE`, `HEADING_1` to `HEADING_6` (case-insensitive;
  a space instead of the underscore also works). Omit for body text.
- `bold` and `italic` apply to the whole paragraph.
- All `paragraphs` are written first, then all `tables`. Put a table's
  caption as the last paragraph and keep one table per document when order
  matters, or split into two files.
- Cells are converted to text; format numbers yourself
  (`48,200.50 USD`).

There is no bullet list type. Write list items as short paragraphs that
start with a dash, or use a table.

## Edit: operations

- `replaceText` `{ search, replacement, all? }` — matches visible text even
  when Word split it across runs. `all` defaults to true; pass `false` to
  replace only the first match. An empty `replacement` deletes the text.
- `appendParagraph` `{ text, style? }` — adds to the end of the body.
  `style` is a Word style id (`Heading1`, `Heading2`, `ListParagraph`) and
  only renders if the document defines it; inspect first to see which
  styles exist.

Unsupported: inserting between paragraphs, tables, images, headers and
footers, tracked changes. Say so and offer a create-from-scratch version or
a text list of the changes for the person to apply.

## Template fill

1. Inspect the template; collect placeholders such as `{{CUSTOMER}}`.
2. Gather values with first-party tools (`geocrm-customer-brief`,
   `geocrm-analysis`).
3. One `edit_local_office_file` call with one `replaceText` per placeholder
   and an `outputPath` such as `office-output/acme-proposal-2026-09.docx`.
4. Inspect the output and confirm no placeholder remains.

## Writing quality

- Title, one-paragraph summary, then sections with `HEADING_1`.
- Numbers come from tool results with the window and currency stated.
- Keep the person's language for the document; keep file names ASCII.
- Do not paste raw JSON into the document.

## Report back

Give the output path and a two-line description of what the file contains.
If the person needs it in the cloud library, say they can import it from
the Office page; you cannot upload it.
