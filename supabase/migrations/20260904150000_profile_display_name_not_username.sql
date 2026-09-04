-- Stop copying the Workbench login username into profiles.display_name / full_name.
-- Person names come from work_profiles.display_name (or a later Settings edit).
-- Employee ids stay on profiles.employee_id. English comments only. Idempotent.

CREATE OR REPLACE FUNCTION public.work_profiles_ensure_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  person_name text;
BEGIN
  person_name := NULLIF(btrim(COALESCE(NEW.display_name, '')), '');
  IF person_name IS NOT NULL AND lower(person_name) = lower(NEW.username) THEN
    person_name := NULL;
  END IF;

  INSERT INTO public.profiles (id, display_name, full_name, employee_id, language)
  VALUES (
    NEW.id,
    person_name,
    person_name,
    NEW.username,
    'en'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    employee_id = COALESCE(
      NULLIF(btrim(COALESCE(public.profiles.employee_id, '')), ''),
      EXCLUDED.employee_id
    ),
    display_name = CASE
      WHEN public.profiles.display_name IS NULL
        OR btrim(public.profiles.display_name) = ''
        OR lower(btrim(public.profiles.display_name)) = lower(NEW.username)
        THEN EXCLUDED.display_name
      ELSE public.profiles.display_name
    END,
    full_name = CASE
      WHEN public.profiles.full_name IS NULL
        OR btrim(public.profiles.full_name) = ''
        OR lower(btrim(public.profiles.full_name)) = lower(NEW.username)
        THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.work_profiles_ensure_profile() IS
  'Ensures a profiles row for each work_profiles login. Copies a person name when set; never uses the username as a display name.';

UPDATE public.profiles AS p
SET
  display_name = CASE
    WHEN p.display_name IS NULL
      OR btrim(p.display_name) = ''
      OR lower(btrim(p.display_name)) = lower(wp.username)
      THEN CASE
        WHEN NULLIF(btrim(COALESCE(wp.display_name, '')), '') IS NULL THEN NULL
        WHEN lower(btrim(wp.display_name)) = lower(wp.username) THEN NULL
        ELSE btrim(wp.display_name)
      END
    ELSE p.display_name
  END,
  full_name = CASE
    WHEN p.full_name IS NULL
      OR btrim(p.full_name) = ''
      OR lower(btrim(p.full_name)) = lower(wp.username)
      THEN CASE
        WHEN NULLIF(btrim(COALESCE(wp.display_name, '')), '') IS NULL THEN NULL
        WHEN lower(btrim(wp.display_name)) = lower(wp.username) THEN NULL
        ELSE btrim(wp.display_name)
      END
    ELSE p.full_name
  END,
  employee_id = COALESCE(NULLIF(btrim(COALESCE(p.employee_id, '')), ''), wp.username)
FROM public.work_profiles AS wp
WHERE p.id = wp.id;
