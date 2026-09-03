# @blocksuite/icons 2.2.17 (GeoCRM engines patch)

- Upstream: https://www.npmjs.com/package/@blocksuite/icons
- Version: `2.2.17`
- License: MIT (same as BlockSuite / AFFiNE)

Vendored so `package.json` `engines.node` is `>=18.19.0` (upstream is
`>=18.19.0 <23.0.0`, which conflicts with this app's Node `>=24` requirement and
floods `npm install` with EBADENGINE). Content is otherwise unchanged from the
published package. Referenced via `overrides["@blocksuite/icons"]`.
