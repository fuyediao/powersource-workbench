# Contributing

Thank you for improving PowerSource Workbench.

## Development expectations

- Keep the desktop client focused on group-wide capabilities. Do not introduce GeoCRM domain modules.
- Keep privileged Supabase credentials in the Go backend only.
- Use TypeScript for desktop code and avoid `any`.
- Keep source comments and AI prompt content in English.
- Put user-facing text in locale JSON files.
- Update `CHANGELOG.md` with every code change.

## Verification

Run these checks before opening a change:

```powershell
npm run lint
npm run lint:style
npm run typecheck
npm run build:vite --prefix desktop

cd ../backend
gofmt -l .
go test ./...
go vet ./...
go build ./...
```
