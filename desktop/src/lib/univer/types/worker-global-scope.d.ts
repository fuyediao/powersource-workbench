/**
 * Minimal ambient declaration for `WorkerGlobalScope`.
 *
 * The project's `tsconfig.json` uses the `DOM` lib (renderer code), which does not
 * declare `WorkerGlobalScope` (that comes from the `WebWorker` lib, which cannot be
 * combined with `DOM` — they declare conflicting globals). The Univer engine
 * feature-detects a Web Worker context via `typeof WorkerGlobalScope` /
 * `instanceof WorkerGlobalScope`, which only needs the type to exist, not its members.
 * See `../ORIGIN.md`.
 */
declare var WorkerGlobalScope: { new (): object } | undefined
