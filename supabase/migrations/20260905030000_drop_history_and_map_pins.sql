-- Drop unused Ask/Harness cloud transcripts and map-pin rows.
-- Those conversations live in Electron SQLite on the signed-in machine.
-- English comments only. Idempotent.

DROP TABLE IF EXISTS public.agent_location_sets;
DROP TABLE IF EXISTS public.history;

NOTIFY pgrst, 'reload schema';
