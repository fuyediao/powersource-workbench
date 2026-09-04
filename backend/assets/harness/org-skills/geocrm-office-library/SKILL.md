# GeoCRM Office library (Harness)

Use when a task starts from a file in GeoCRM Docs, Sheets, or Slides: find it, open it, bring it to the work folder, then inspect or edit locally.

## What the library is

Cloud `office_files` rows the person owns or may read through their groups
(the same ACL as the Office page). Kinds map to formats:

| `kind` | Local extension |
|--------|-----------------|
| `docs` | `.docx` |
| `sheets` | `.xlsx` |
| `slides` | `.pptx` |

Only reads are exposed here. Editing produces a copy in the work folder;
there is no tool that writes back to the cloud file.

## Find the file

`list_office_files` with optional `kind`, `query` (case-insensitive name
search), `limit` (1-100). Result: `files[]` with `id`, `kind`, `name`,
`owner_user_id`, `group_id`, `updated_at`.

If several rows match, show name, kind, and updated date and ask which one
unless the request already pins it. If none match, say so; do not guess an
id.

## Open it

`open_office_file` with the UUID `id`. Result adds `file_name`,
`download_url`, and `expires_in_seconds` (300). The URL is single-purpose
and short-lived; do not paste it into the reply or a file.

## Bring it to disk

The Codex sandbox blocks network access, so the download needs the shell to
run outside the sandbox. Run it once and let the approval prompt do its job;
explain in one line why network is needed ("downloading the signed Office
file you asked me to edit").

- Windows: `curl.exe -L -o "office-input\<file_name>" "<download_url>"`
- macOS / Linux: `curl -L -o "office-input/<file_name>" "<download_url>"`

Create `office-input/` in the work folder first if it does not exist. If the
approval is denied or the URL expired, call `open_office_file` again for a
fresh URL, or ask the person to attach the file in the composer instead. Do
not loop on failed downloads.

## Then work locally

- `inspect_local_office_file` on the downloaded path (`sheet` for one
  worksheet of a workbook).
- `edit_local_office_file` writes a copy (default
  `office-output/<name>-edited.<ext>`); the downloaded source is untouched.
- `create_local_office_file` for a brand-new deliverable.

Format details: `geocrm-word`, `geocrm-excel`, `geocrm-powerpoint`.

## Report back

Give the local output path and say plainly that the cloud copy is
unchanged; the person can import the edited file from the Office page. Never
say "I updated the document in GeoCRM".

## Attached files

When the person attaches an Office file in the composer, the turn already
lists its local path. Skip the library steps and go straight to
`inspect_local_office_file`.
