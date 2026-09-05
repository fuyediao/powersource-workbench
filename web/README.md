# PowerSource Workbench web

Static pages for public hosting. The first page is the desktop installer list.

## Download page

`download/` is a single-language English page for `https://binovo.ai/download`.

Installer links call the Workbench feed on `https://download.powersource.work/{windows|macos-m|macos-i}/beta`. Publish the folder as `/download` on the site root so `index.html` is served at that path.

Vercel deploys the `web/` folder as a static site (see the repository-root `vercel.json`). `/` rewrites to `/download`.
