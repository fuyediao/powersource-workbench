-- Public Storage bucket for Workbench desktop installers.
-- Object layout: {macos-m|macos-i|windows}/{release}/{file}
-- Example: macos-m/beta0.1.0/workbench.dmg

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'desktop-releases',
  'desktop-releases',
  true,
  1073741824,
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "desktop-releases_select" ON storage.objects;
CREATE POLICY "desktop-releases_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'desktop-releases');

DROP POLICY IF EXISTS "desktop-releases_insert" ON storage.objects;
CREATE POLICY "desktop-releases_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'desktop-releases'
    AND public.is_system_admin()
  );

DROP POLICY IF EXISTS "desktop-releases_update" ON storage.objects;
CREATE POLICY "desktop-releases_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'desktop-releases'
    AND public.is_system_admin()
  )
  WITH CHECK (
    bucket_id = 'desktop-releases'
    AND public.is_system_admin()
  );

DROP POLICY IF EXISTS "desktop-releases_delete" ON storage.objects;
CREATE POLICY "desktop-releases_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'desktop-releases'
    AND public.is_system_admin()
  );
