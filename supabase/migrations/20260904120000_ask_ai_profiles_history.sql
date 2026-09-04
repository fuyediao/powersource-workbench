-- Ask / AI settings foundation: profiles, history, map pins, avatar bucket.
-- English comments only. Idempotent.

-- ============================================================================
-- Helper: platform admins from work_profiles
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.work_profiles wp
    WHERE wp.id = auth.uid()
      AND wp.status = 'active'
      AND wp.role IN ('super_admin', 'system_admin')
  );
$$;

COMMENT ON FUNCTION public.is_system_admin() IS
  'True when the signed-in Workbench user is an active super_admin or system_admin.';

GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated, service_role;

-- ============================================================================
-- profiles (BYOK keys + leftover CRM profile fields)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  display_name text,
  full_name text,
  language text,
  organization text,
  bio text,
  phone_number text,
  phone_country text,
  avatar_url text,
  avatar_index integer,
  employee_id text,
  openai_api_key text,
  anthropic_api_key text,
  gemini_api_key text,
  grok_api_key text,
  ai_provider_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Per-user profile and BYOK AI keys. Login identity stays on work_profiles.username.';
COMMENT ON COLUMN public.profiles.ai_provider_keys IS
  'Map of provider id to API key string for desktop AI Settings BYOK.';

CREATE OR REPLACE FUNCTION public.profiles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_system_admin());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- Keep a profiles row for every Workbench login id.
CREATE OR REPLACE FUNCTION public.work_profiles_ensure_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, full_name, employee_id, language)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.display_name, ''), NEW.username),
    COALESCE(NULLIF(NEW.display_name, ''), NEW.username),
    NEW.username,
    'en'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    employee_id = COALESCE(public.profiles.employee_id, EXCLUDED.employee_id),
    display_name = CASE
      WHEN public.profiles.display_name IS NULL OR btrim(public.profiles.display_name) = ''
        THEN EXCLUDED.display_name
      ELSE public.profiles.display_name
    END,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_profiles_ensure_profile ON public.work_profiles;
CREATE TRIGGER work_profiles_ensure_profile
  AFTER INSERT OR UPDATE OF username, display_name ON public.work_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.work_profiles_ensure_profile();

INSERT INTO public.profiles (id, display_name, full_name, employee_id, language)
SELECT
  wp.id,
  COALESCE(NULLIF(wp.display_name, ''), wp.username),
  COALESCE(NULLIF(wp.display_name, ''), wp.username),
  wp.username,
  'en'
FROM public.work_profiles wp
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- history (Ask + Harness)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  query text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_location jsonb,
  group_id uuid,
  created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assistant_kind text NOT NULL DEFAULT 'ask',
  harness_thread_id text,
  harness_items jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT history_assistant_kind_check CHECK (assistant_kind IN ('ask', 'agent')),
  CONSTRAINT history_harness_items_array_check CHECK (
    harness_items IS NULL OR jsonb_typeof(harness_items) = 'array'
  )
);

CREATE INDEX IF NOT EXISTS idx_history_user_kind
  ON public.history (user_id, assistant_kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_harness_thread
  ON public.history (user_id, harness_thread_id)
  WHERE assistant_kind = 'agent' AND harness_thread_id IS NOT NULL;

COMMENT ON TABLE public.history IS
  'Ask and Harness conversation threads. Rows are not shared across assistant_kind.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.history TO service_role;

ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS history_own_all ON public.history;
CREATE POLICY history_own_all
  ON public.history
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_system_admin());

-- ============================================================================
-- agent_location_sets (Ask / mapchat pins)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_location_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id uuid,
  source text NOT NULL,
  skill text,
  locations jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_location_sets_source_check CHECK (source IN ('agent', 'mapchat'))
);

CREATE INDEX IF NOT EXISTS agent_location_sets_user_id_idx
  ON public.agent_location_sets (user_id);

GRANT SELECT ON public.agent_location_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_location_sets TO service_role;

ALTER TABLE public.agent_location_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_location_sets_select_own ON public.agent_location_sets;
CREATE POLICY agent_location_sets_select_own
  ON public.agent_location_sets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- profile-avatars bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view profile avatars" ON storage.objects;
CREATE POLICY "Public can view profile avatars"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "Users can upload own profile avatar" ON storage.objects;
CREATE POLICY "Users can upload own profile avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can update own profile avatar" ON storage.objects;
CREATE POLICY "Users can update own profile avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete own profile avatar" ON storage.objects;
CREATE POLICY "Users can delete own profile avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

NOTIFY pgrst, 'reload schema';
