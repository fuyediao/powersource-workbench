-- Groups, leftover CRM customers, Mail, and Calendar for Workbench.
-- English comments only. Idempotent. Does not copy GeoCRM production data.

-- ============================================================================
-- Groups and membership
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_admin_id uuid UNIQUE REFERENCES auth.users (id) ON DELETE SET NULL,
  description text,
  is_temp_managed boolean NOT NULL DEFAULT false,
  pending_admin_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_group_admin boolean NOT NULL DEFAULT false,
  CONSTRAINT group_members_group_user_key UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user
  ON public.group_members (user_id)
  WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.is_group_member(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.user_id = p_user_id
      AND gm.group_id = p_group_id
      AND gm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_of_group(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = p_group_id
      AND g.group_admin_id = p_user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.is_active = true
      AND gm.is_group_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_group_data(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT public.is_system_admin()
    OR public.is_group_member(p_user_id, p_group_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_of_group(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_group_data(uuid, uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated, service_role;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS groups_select ON public.groups;
CREATE POLICY groups_select ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_system_admin() OR public.is_group_member(auth.uid(), id));

DROP POLICY IF EXISTS groups_write ON public.groups;
CREATE POLICY groups_write ON public.groups
  FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS group_members_select ON public.group_members;
CREATE POLICY group_members_select ON public.group_members
  FOR SELECT TO authenticated
  USING (public.is_system_admin() OR public.is_group_member(auth.uid(), group_id));

DROP POLICY IF EXISTS group_members_write ON public.group_members;
CREATE POLICY group_members_write ON public.group_members
  FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id))
  WITH CHECK (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id));

ALTER TABLE public.history
  DROP CONSTRAINT IF EXISTS history_group_id_fkey;
ALTER TABLE public.history
  ADD CONSTRAINT history_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.groups (id) ON DELETE SET NULL;

ALTER TABLE public.agent_location_sets
  DROP CONSTRAINT IF EXISTS agent_location_sets_group_id_fkey;
ALTER TABLE public.agent_location_sets
  ADD CONSTRAINT agent_location_sets_group_id_fkey
  FOREIGN KEY (group_id) REFERENCES public.groups (id) ON DELETE SET NULL;

-- ============================================================================
-- Desktop module access and write grants
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.group_desktop_module_access (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  module_key text NOT NULL,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, module_key),
  CONSTRAINT group_desktop_module_access_module_key_check CHECK (module_key = ANY (ARRAY[
    'desktop_chat',
    'desktop_agent',
    'desktop_messages',
    'desktop_mail',
    'desktop_calendar',
    'desktop_kanban',
    'desktop_map',
    'desktop_admin',
    'desktop_orders',
    'desktop_products',
    'desktop_nexdot',
    'desktop_te_admin',
    'desktop_team',
    'desktop_aura',
    'desktop_folio',
    'desktop_docs',
    'desktop_sheets',
    'desktop_slides',
    'desktop_map_favorites',
    'desktop_map_customers',
    'desktop_map_leads',
    'desktop_map_competitors'
  ]))
);

CREATE TABLE IF NOT EXISTS public.group_desktop_writes_admin (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  action text NOT NULL,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id, resource_key, action),
  CONSTRAINT group_desktop_writes_admin_resource_key_check CHECK (resource_key = ANY (ARRAY[
    'customers', 'contacts', 'leads', 'visit_log', 'opportunities', 'follow_ups',
    'kol', 'agent', 'competitors'
  ])),
  CONSTRAINT group_desktop_writes_admin_action_check CHECK (action = ANY (ARRAY[
    'insert', 'update', 'delete'
  ]))
);

CREATE TABLE IF NOT EXISTS public.group_desktop_writes_calendar (
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resource_key text NOT NULL,
  action text NOT NULL,
  granted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id, resource_key, action),
  CONSTRAINT group_desktop_writes_calendar_resource_key_check CHECK (resource_key = ANY (ARRAY[
    'calendars', 'events'
  ])),
  CONSTRAINT group_desktop_writes_calendar_action_check CHECK (action = ANY (ARRAY[
    'insert', 'update', 'delete'
  ]))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_desktop_module_access TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_desktop_writes_admin TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_desktop_writes_calendar TO authenticated, service_role;

ALTER TABLE public.group_desktop_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_desktop_writes_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_desktop_writes_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_desktop_module_access_select ON public.group_desktop_module_access;
CREATE POLICY group_desktop_module_access_select ON public.group_desktop_module_access
  FOR SELECT TO authenticated
  USING (public.is_system_admin() OR public.is_group_member(auth.uid(), group_id));

DROP POLICY IF EXISTS group_desktop_module_access_write ON public.group_desktop_module_access;
CREATE POLICY group_desktop_module_access_write ON public.group_desktop_module_access
  FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS group_desktop_writes_admin_select ON public.group_desktop_writes_admin;
CREATE POLICY group_desktop_writes_admin_select ON public.group_desktop_writes_admin
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_system_admin()
    OR public.is_admin_of_group(auth.uid(), group_id)
  );

DROP POLICY IF EXISTS group_desktop_writes_admin_write ON public.group_desktop_writes_admin;
CREATE POLICY group_desktop_writes_admin_write ON public.group_desktop_writes_admin
  FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id))
  WITH CHECK (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id));

DROP POLICY IF EXISTS group_desktop_writes_calendar_select ON public.group_desktop_writes_calendar;
CREATE POLICY group_desktop_writes_calendar_select ON public.group_desktop_writes_calendar
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_system_admin()
    OR public.is_admin_of_group(auth.uid(), group_id)
  );

DROP POLICY IF EXISTS group_desktop_writes_calendar_write ON public.group_desktop_writes_calendar;
CREATE POLICY group_desktop_writes_calendar_write ON public.group_desktop_writes_calendar
  FOR ALL TO authenticated
  USING (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id))
  WITH CHECK (public.is_system_admin() OR public.is_admin_of_group(auth.uid(), group_id));

-- Calendar group writes honor Desktop Writes when rows exist; group admins always write.
CREATE OR REPLACE FUNCTION public.can_write_module(p_group_id uuid, p_module text, p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT public.is_system_admin()
    OR public.is_admin_of_group(auth.uid(), p_group_id)
    OR (
      p_module = 'calendar'
      AND EXISTS (
        SELECT 1
        FROM public.group_desktop_writes_calendar w
        WHERE w.group_id = p_group_id
          AND w.user_id = auth.uid()
          AND w.action = p_action
      )
    )
    OR (
      p_module IN ('customers', 'contacts')
      AND EXISTS (
        SELECT 1
        FROM public.group_desktop_writes_admin w
        WHERE w.group_id = p_group_id
          AND w.user_id = auth.uid()
          AND w.action = p_action
          AND w.resource_key = CASE
            WHEN p_module = 'contacts' THEN 'contacts'
            ELSE 'customers'
          END
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_module(uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- Customers and contacts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  company_name text NOT NULL,
  short_name text,
  customer_code text NOT NULL UNIQUE,
  contact_name text,
  phone text,
  phone_country text,
  fax text,
  fax_country text,
  email text,
  website text,
  note text,
  category text,
  customer_type text,
  customer_level text,
  cooperation_status text,
  company_country text,
  company_state text,
  company_city text,
  company_postal_code text,
  company_address_line1 text,
  company_address_line2 text,
  address text,
  latitude numeric,
  longitude numeric,
  industry text,
  tax_id text,
  employee_count integer,
  description text,
  logo_url text,
  ai_summary text,
  ai_summary_model text,
  ai_summary_generated_at timestamptz,
  ai_summary_en_us text,
  ai_summary_zh_cn text,
  ai_summary_zh_tw text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_group ON public.customers (group_id);
CREATE INDEX IF NOT EXISTS idx_customers_owner ON public.customers (owner_user_id);

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  phone_country text,
  mobile text,
  mobile_country text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON public.customer_contacts (customer_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_set_updated_at ON public.customers;
CREATE TRIGGER customers_set_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS customer_contacts_set_updated_at ON public.customer_contacts;
CREATE TRIGGER customer_contacts_set_updated_at
  BEFORE UPDATE ON public.customer_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated, service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select ON public.customers;
CREATE POLICY customers_select ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin()
    OR owner_user_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_access_group_data(auth.uid(), group_id))
  );

DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_system_admin()
    OR (
      group_id IS NULL
      AND owner_user_id = auth.uid()
    )
    OR (
      group_id IS NOT NULL
      AND public.can_write_module(group_id, 'customers', 'insert')
    )
  );

DROP POLICY IF EXISTS customers_update ON public.customers;
CREATE POLICY customers_update ON public.customers
  FOR UPDATE TO authenticated
  USING (
    public.is_system_admin()
    OR owner_user_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_write_module(group_id, 'customers', 'update'))
  )
  WITH CHECK (
    public.is_system_admin()
    OR owner_user_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_write_module(group_id, 'customers', 'update'))
  );

DROP POLICY IF EXISTS customers_delete ON public.customers;
CREATE POLICY customers_delete ON public.customers
  FOR DELETE TO authenticated
  USING (
    public.is_system_admin()
    OR owner_user_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_write_module(group_id, 'customers', 'delete'))
  );

DROP POLICY IF EXISTS customer_contacts_select ON public.customer_contacts;
CREATE POLICY customer_contacts_select ON public.customer_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
        AND (
          public.is_system_admin()
          OR c.owner_user_id = auth.uid()
          OR (c.group_id IS NOT NULL AND public.can_access_group_data(auth.uid(), c.group_id))
        )
    )
  );

DROP POLICY IF EXISTS customer_contacts_write ON public.customer_contacts;
CREATE POLICY customer_contacts_write ON public.customer_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
        AND (
          public.is_system_admin()
          OR c.owner_user_id = auth.uid()
          OR (c.group_id IS NOT NULL AND public.can_write_module(c.group_id, 'contacts', 'update'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
        AND (
          public.is_system_admin()
          OR c.owner_user_id = auth.uid()
          OR (c.group_id IS NOT NULL AND public.can_write_module(c.group_id, 'contacts', 'insert'))
        )
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-logos', 'customer-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view customer logos" ON storage.objects;
CREATE POLICY "Public can view customer logos"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'customer-logos');

DROP POLICY IF EXISTS "Users can write customer logos" ON storage.objects;
CREATE POLICY "Users can write customer logos"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'customer-logos')
  WITH CHECK (bucket_id = 'customer-logos');

-- ============================================================================
-- Mail
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mail_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.mail_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups (id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider = ANY (ARRAY[
    'gmail'::text, 'outlook'::text, 'yahoo'::text, 'netease'::text, 'alibaba'::text, 'imap'::text
  ])),
  email text NOT NULL,
  display_name text,
  avatar_url text,
  auth_type text NOT NULL DEFAULT 'password' CHECK (auth_type = ANY (ARRAY['oauth'::text, 'password'::text])),
  is_primary boolean NOT NULL DEFAULT false,
  is_auto_linked boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT false,
  shared_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY[
    'active'::text, 'error'::text, 'reauth_required'::text, 'disconnected'::text
  ])),
  error_message text,
  oauth_scope text,
  last_sync_at timestamptz,
  historical_sync_completed_at timestamptz,
  gmail_history_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_accounts_owner ON public.mail_accounts (owner_user_id);

CREATE TABLE IF NOT EXISTS public.mail_account_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  secret_type text NOT NULL CHECK (secret_type = ANY (ARRAY[
    'oauth_refresh_token'::text, 'imap_password'::text, 'app_password'::text
  ])),
  encrypted_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_account_secrets_account_type_uidx UNIQUE (mail_account_id, secret_type)
);

CREATE TABLE IF NOT EXISTS public.mail_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  state text NOT NULL UNIQUE,
  return_origin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  name text NOT NULL,
  role text CHECK (role = ANY (ARRAY[
    'inbox'::text, 'sent'::text, 'drafts'::text, 'trash'::text, 'spam'::text, 'archive'::text, 'custom'::text
  ])),
  unread_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  uidvalidity bigint,
  uidnext bigint,
  synced_min_uid bigint,
  highestmodseq bigint,
  last_shallow_at timestamptz,
  last_deep_at timestamptz,
  local_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_folders_mail_account_id_provider_id_key UNIQUE (mail_account_id, provider_id)
);

CREATE TABLE IF NOT EXISTS public.mail_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  provider_thread_id text,
  subject text,
  snippet text,
  last_message_at timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  unread_count integer NOT NULL DEFAULT 0,
  has_attachments boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  labels text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_threads_account_provider_thread
  ON public.mail_threads (mail_account_id, provider_thread_id)
  WHERE provider_thread_id IS NOT NULL AND btrim(provider_thread_id) <> '';

CREATE TABLE IF NOT EXISTS public.mail_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.mail_threads (id) ON DELETE SET NULL,
  folder_id uuid REFERENCES public.mail_folders (id) ON DELETE SET NULL,
  provider_message_id text,
  message_id_header text,
  in_reply_to text,
  subject text,
  from_address text NOT NULL,
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  snippet text,
  received_at timestamptz,
  sent_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_sent boolean NOT NULL DEFAULT false,
  is_draft boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  labels text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_messages_account_provider_message
  ON public.mail_messages (mail_account_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL AND btrim(provider_message_id) <> '';

CREATE INDEX IF NOT EXISTS idx_mail_messages_received
  ON public.mail_messages (received_at DESC);

CREATE TABLE IF NOT EXISTS public.mail_message_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.mail_messages (id) ON DELETE CASCADE,
  body_html text,
  body_text text,
  raw_mime_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_message_bodies_message
  ON public.mail_message_bodies (message_id);

CREATE TABLE IF NOT EXISTS public.mail_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.mail_messages (id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text,
  size_bytes integer,
  provider_attachment_id text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mail_send_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  operator_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  send_identity text NOT NULL DEFAULT 'personal' CHECK (send_identity = ANY (ARRAY['shared'::text, 'personal'::text])),
  from_address text NOT NULL,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  body_html text,
  body_text text,
  reply_to text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  in_reply_to_message_id uuid REFERENCES public.mail_messages (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])),
  error_message text,
  provider_message_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_send_jobs_scheduled
  ON public.mail_send_jobs (scheduled_at)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mail_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY[
    'pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'cancelled'::text
  ])),
  messages_synced integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'incremental' CHECK (kind = ANY (ARRAY['incremental'::text, 'historical'::text])),
  progress integer NOT NULL DEFAULT 0,
  total_estimated integer,
  historical_since timestamptz
);

CREATE TABLE IF NOT EXISTS public.mail_sync_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  operator_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind = ANY (ARRAY[
    'read'::text, 'unread'::text, 'star'::text, 'unstar'::text,
    'trash'::text, 'untrash'::text, 'archive'::text, 'unarchive'::text,
    'spam'::text, 'unspam'::text, 'important'::text, 'unimportant'::text,
    'apply_label'::text, 'remove_label'::text, 'snooze'::text, 'unsnooze'::text,
    'send'::text, 'empty_folder'::text, 'delete_forever'::text
  ])),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending_remote' CHECK (status = ANY (ARRAY[
    'pending_remote'::text, 'done'::text, 'failed'::text, 'cancelled'::text
  ])),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_sync_tasks_pending
  ON public.mail_sync_tasks (created_at)
  WHERE status = 'pending_remote';

CREATE TABLE IF NOT EXISTS public.mail_message_snoozes (
  message_id uuid PRIMARY KEY REFERENCES public.mail_messages (id) ON DELETE CASCADE,
  mail_account_id uuid NOT NULL REFERENCES public.mail_accounts (id) ON DELETE CASCADE,
  snoozed_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mail_message_snoozes_until
  ON public.mail_message_snoozes (snoozed_until);

DROP TRIGGER IF EXISTS trg_mail_accounts_updated_at ON public.mail_accounts;
CREATE TRIGGER trg_mail_accounts_updated_at
  BEFORE UPDATE ON public.mail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

DROP TRIGGER IF EXISTS trg_mail_account_secrets_updated_at ON public.mail_account_secrets;
CREATE TRIGGER trg_mail_account_secrets_updated_at
  BEFORE UPDATE ON public.mail_account_secrets
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

DROP TRIGGER IF EXISTS trg_mail_folders_updated_at ON public.mail_folders;
CREATE TRIGGER trg_mail_folders_updated_at
  BEFORE UPDATE ON public.mail_folders
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

DROP TRIGGER IF EXISTS trg_mail_threads_updated_at ON public.mail_threads;
CREATE TRIGGER trg_mail_threads_updated_at
  BEFORE UPDATE ON public.mail_threads
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

DROP TRIGGER IF EXISTS trg_mail_messages_updated_at ON public.mail_messages;
CREATE TRIGGER trg_mail_messages_updated_at
  BEFORE UPDATE ON public.mail_messages
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

DROP TRIGGER IF EXISTS trg_mail_sync_tasks_updated_at ON public.mail_sync_tasks;
CREATE TRIGGER trg_mail_sync_tasks_updated_at
  BEFORE UPDATE ON public.mail_sync_tasks
  FOR EACH ROW EXECUTE FUNCTION public.mail_set_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_mail_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mail_accounts a
    WHERE a.id = p_account_id
      AND a.owner_user_id = auth.uid()
  ) OR public.is_system_admin();
$$;

GRANT EXECUTE ON FUNCTION public.can_access_mail_account(uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_accounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_account_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_folders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_threads TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_messages TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_message_bodies TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_attachments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_send_jobs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_sync_jobs TO authenticated, service_role;
GRANT SELECT ON public.mail_sync_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_sync_tasks TO service_role;
GRANT SELECT ON public.mail_message_snoozes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mail_message_snoozes TO service_role;

ALTER TABLE public.mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_account_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_message_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_send_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_sync_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_message_snoozes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mail_accounts_owner ON public.mail_accounts;
CREATE POLICY mail_accounts_owner ON public.mail_accounts
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_system_admin())
  WITH CHECK (owner_user_id = auth.uid() OR public.is_system_admin());

DROP POLICY IF EXISTS mail_account_secrets_deny ON public.mail_account_secrets;
CREATE POLICY mail_account_secrets_deny ON public.mail_account_secrets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS mail_oauth_states_deny ON public.mail_oauth_states;
CREATE POLICY mail_oauth_states_deny ON public.mail_oauth_states
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS mail_folders_access ON public.mail_folders;
CREATE POLICY mail_folders_access ON public.mail_folders
  FOR ALL TO authenticated
  USING (public.can_access_mail_account(mail_account_id))
  WITH CHECK (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_threads_access ON public.mail_threads;
CREATE POLICY mail_threads_access ON public.mail_threads
  FOR ALL TO authenticated
  USING (public.can_access_mail_account(mail_account_id))
  WITH CHECK (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_messages_access ON public.mail_messages;
CREATE POLICY mail_messages_access ON public.mail_messages
  FOR ALL TO authenticated
  USING (public.can_access_mail_account(mail_account_id))
  WITH CHECK (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_message_bodies_select ON public.mail_message_bodies;
CREATE POLICY mail_message_bodies_select ON public.mail_message_bodies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mail_messages m
      WHERE m.id = message_id AND public.can_access_mail_account(m.mail_account_id)
    )
  );

DROP POLICY IF EXISTS mail_attachments_select ON public.mail_attachments;
CREATE POLICY mail_attachments_select ON public.mail_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mail_messages m
      WHERE m.id = message_id AND public.can_access_mail_account(m.mail_account_id)
    )
  );

DROP POLICY IF EXISTS mail_send_jobs_access ON public.mail_send_jobs;
CREATE POLICY mail_send_jobs_access ON public.mail_send_jobs
  FOR ALL TO authenticated
  USING (public.can_access_mail_account(mail_account_id))
  WITH CHECK (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_sync_jobs_access ON public.mail_sync_jobs;
CREATE POLICY mail_sync_jobs_access ON public.mail_sync_jobs
  FOR ALL TO authenticated
  USING (public.can_access_mail_account(mail_account_id))
  WITH CHECK (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_sync_tasks_select ON public.mail_sync_tasks;
CREATE POLICY mail_sync_tasks_select ON public.mail_sync_tasks
  FOR SELECT TO authenticated
  USING (public.can_access_mail_account(mail_account_id));

DROP POLICY IF EXISTS mail_message_snoozes_select ON public.mail_message_snoozes;
CREATE POLICY mail_message_snoozes_select ON public.mail_message_snoozes
  FOR SELECT TO authenticated
  USING (public.can_access_mail_account(mail_account_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mail-attachments', 'mail-attachments', false, 26214400, NULL)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "mail_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_delete" ON storage.objects;
DROP POLICY IF EXISTS "Mail attachments are private" ON storage.objects;

-- ============================================================================
-- Calendar
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Calendar',
  color text NOT NULL DEFAULT '#0b6e4f',
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  google_calendar_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendars_owner_xor_group CHECK (
    (owner_user_id IS NOT NULL AND group_id IS NULL)
    OR (owner_user_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS calendars_one_default_owner_uidx
  ON public.calendars (owner_user_id)
  WHERE is_default = true AND owner_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendars_one_default_group_uidx
  ON public.calendars (group_id)
  WHERE is_default = true AND group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendars_owner_google_calendar_uidx
  ON public.calendars (owner_user_id, google_calendar_id)
  WHERE owner_user_id IS NOT NULL AND google_calendar_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups (id) ON DELETE CASCADE,
  calendar_id uuid REFERENCES public.calendars (id) ON DELETE SET NULL,
  rrule text,
  exdate timestamptz[] NOT NULL DEFAULT '{}'::timestamptz[],
  source text NOT NULL DEFAULT 'geocrm',
  google_event_id text,
  google_calendar_id text,
  google_etag text,
  google_updated_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_owner_xor_group CHECK (
    (owner_user_id IS NOT NULL AND group_id IS NULL)
    OR (owner_user_id IS NULL AND group_id IS NOT NULL)
  ),
  CONSTRAINT calendar_events_end_after_start CHECK (end_at >= start_at),
  CONSTRAINT calendar_events_source_check CHECK (source = ANY (ARRAY['geocrm'::text, 'google'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_owner_google_event_uidx
  ON public.calendar_events (owner_user_id, google_event_id)
  WHERE google_event_id IS NOT NULL AND owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_events_owner_start_idx
  ON public.calendar_events (owner_user_id, start_at)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS calendar_events_group_start_idx
  ON public.calendar_events (group_id, start_at)
  WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.calendar_event_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_attendees_status_check CHECK (
    status = ANY (ARRAY['invited'::text, 'accepted'::text, 'declined'::text, 'tentative'::text])
  ),
  CONSTRAINT calendar_event_attendees_event_user_uidx UNIQUE (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.calendar_google_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  google_calendar_id text NOT NULL DEFAULT 'primary',
  selected_google_calendar_ids text[] NOT NULL DEFAULT '{}'::text[],
  oauth_scope text,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY[
    'active'::text, 'error'::text, 'reauth_required'::text, 'disconnected'::text
  ])),
  error_message text,
  last_sync_at timestamptz,
  last_push_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_google_account_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.calendar_google_accounts (id) ON DELETE CASCADE,
  secret_type text NOT NULL CHECK (secret_type = ANY (ARRAY['oauth_refresh_token'::text])),
  encrypted_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_google_account_secrets_account_type_uidx UNIQUE (account_id, secret_type)
);

CREATE TABLE IF NOT EXISTS public.calendar_google_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  state text NOT NULL UNIQUE,
  return_origin text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_google_watch_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.calendar_google_accounts (id) ON DELETE CASCADE,
  google_calendar_id text NOT NULL,
  channel_id text NOT NULL,
  resource_id text NOT NULL,
  resource_uri text,
  token text NOT NULL,
  expiration timestamptz NOT NULL,
  sync_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_google_watch_channels_channel_uidx UNIQUE (channel_id),
  CONSTRAINT calendar_google_watch_channels_account_cal_uidx UNIQUE (account_id, google_calendar_id)
);

DROP TRIGGER IF EXISTS calendars_set_updated_at ON public.calendars;
CREATE TRIGGER calendars_set_updated_at
  BEFORE UPDATE ON public.calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS calendar_events_set_updated_at ON public.calendar_events;
CREATE TRIGGER calendar_events_set_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS calendar_google_accounts_set_updated_at ON public.calendar_google_accounts;
CREATE TRIGGER calendar_google_accounts_set_updated_at
  BEFORE UPDATE ON public.calendar_google_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS calendar_google_watch_channels_set_updated_at ON public.calendar_google_watch_channels;
CREATE TRIGGER calendar_google_watch_channels_set_updated_at
  BEFORE UPDATE ON public.calendar_google_watch_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendars TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_attendees TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_google_accounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_google_account_secrets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_google_oauth_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_google_watch_channels TO service_role;

ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_google_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_google_account_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_google_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_google_watch_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendars_personal_select ON public.calendars;
CREATE POLICY calendars_personal_select ON public.calendars
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS calendars_personal_insert ON public.calendars;
CREATE POLICY calendars_personal_insert ON public.calendars
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND group_id IS NULL);

DROP POLICY IF EXISTS calendars_personal_update ON public.calendars;
CREATE POLICY calendars_personal_update ON public.calendars
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid() AND group_id IS NULL);

DROP POLICY IF EXISTS calendars_personal_delete ON public.calendars;
CREATE POLICY calendars_personal_delete ON public.calendars
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() AND is_default = false);

DROP POLICY IF EXISTS calendars_group_select ON public.calendars;
CREATE POLICY calendars_group_select ON public.calendars
  FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND public.can_access_group_data(auth.uid(), group_id));

DROP POLICY IF EXISTS calendars_group_insert ON public.calendars;
CREATE POLICY calendars_group_insert ON public.calendars
  FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    AND owner_user_id IS NULL
    AND public.can_write_module(group_id, 'calendar', 'insert')
  );

DROP POLICY IF EXISTS calendars_group_update ON public.calendars;
CREATE POLICY calendars_group_update ON public.calendars
  FOR UPDATE TO authenticated
  USING (group_id IS NOT NULL AND public.can_write_module(group_id, 'calendar', 'update'))
  WITH CHECK (
    group_id IS NOT NULL
    AND owner_user_id IS NULL
    AND public.can_write_module(group_id, 'calendar', 'update')
  );

DROP POLICY IF EXISTS calendars_group_delete ON public.calendars;
CREATE POLICY calendars_group_delete ON public.calendars
  FOR DELETE TO authenticated
  USING (
    group_id IS NOT NULL
    AND is_default = false
    AND public.can_write_module(group_id, 'calendar', 'delete')
  );

DROP POLICY IF EXISTS calendar_events_personal_select ON public.calendar_events;
CREATE POLICY calendar_events_personal_select ON public.calendar_events
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS calendar_events_personal_insert ON public.calendar_events;
CREATE POLICY calendar_events_personal_insert ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND group_id IS NULL);

DROP POLICY IF EXISTS calendar_events_personal_update ON public.calendar_events;
CREATE POLICY calendar_events_personal_update ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid() AND group_id IS NULL);

DROP POLICY IF EXISTS calendar_events_personal_delete ON public.calendar_events;
CREATE POLICY calendar_events_personal_delete ON public.calendar_events
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS calendar_events_group_select ON public.calendar_events;
CREATE POLICY calendar_events_group_select ON public.calendar_events
  FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND public.can_access_group_data(auth.uid(), group_id));

DROP POLICY IF EXISTS calendar_events_group_insert ON public.calendar_events;
CREATE POLICY calendar_events_group_insert ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    group_id IS NOT NULL
    AND owner_user_id IS NULL
    AND public.can_write_module(group_id, 'calendar', 'insert')
  );

DROP POLICY IF EXISTS calendar_events_group_update ON public.calendar_events;
CREATE POLICY calendar_events_group_update ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (group_id IS NOT NULL AND public.can_write_module(group_id, 'calendar', 'update'))
  WITH CHECK (
    group_id IS NOT NULL
    AND owner_user_id IS NULL
    AND public.can_write_module(group_id, 'calendar', 'update')
  );

DROP POLICY IF EXISTS calendar_events_group_delete ON public.calendar_events;
CREATE POLICY calendar_events_group_delete ON public.calendar_events
  FOR DELETE TO authenticated
  USING (group_id IS NOT NULL AND public.can_write_module(group_id, 'calendar', 'delete'));

CREATE OR REPLACE FUNCTION public.calendar_user_is_event_attendee(
  p_event_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.calendar_event_attendees a
    WHERE a.event_id = p_event_id
      AND a.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.calendar_user_can_read_event_row(
  p_event_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.calendar_events e
    WHERE e.id = p_event_id
      AND (
        e.owner_user_id = p_user_id
        OR (
          e.group_id IS NOT NULL
          AND public.can_access_group_data(p_user_id, e.group_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.calendar_user_can_manage_event_attendees(
  p_event_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.calendar_events e
    WHERE e.id = p_event_id
      AND (
        (e.owner_user_id = p_user_id AND e.group_id IS NULL)
        OR (
          e.group_id IS NOT NULL
          AND public.can_write_module(e.group_id, 'calendar', 'update')
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.calendar_user_is_event_attendee(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_user_can_read_event_row(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calendar_user_can_manage_event_attendees(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS calendar_event_attendees_select ON public.calendar_event_attendees;
CREATE POLICY calendar_event_attendees_select ON public.calendar_event_attendees
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.calendar_user_can_read_event_row(event_id, auth.uid())
  );

DROP POLICY IF EXISTS calendar_event_attendees_insert ON public.calendar_event_attendees;
CREATE POLICY calendar_event_attendees_insert ON public.calendar_event_attendees
  FOR INSERT TO authenticated
  WITH CHECK (public.calendar_user_can_manage_event_attendees(event_id, auth.uid()));

DROP POLICY IF EXISTS calendar_event_attendees_update ON public.calendar_event_attendees;
CREATE POLICY calendar_event_attendees_update ON public.calendar_event_attendees
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.calendar_user_can_manage_event_attendees(event_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.calendar_user_can_manage_event_attendees(event_id, auth.uid())
  );

DROP POLICY IF EXISTS calendar_event_attendees_delete ON public.calendar_event_attendees;
CREATE POLICY calendar_event_attendees_delete ON public.calendar_event_attendees
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.calendar_user_can_manage_event_attendees(event_id, auth.uid())
  );

DROP POLICY IF EXISTS calendar_google_accounts_owner ON public.calendar_google_accounts;
CREATE POLICY calendar_google_accounts_owner ON public.calendar_google_accounts
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS calendar_google_account_secrets_deny_all ON public.calendar_google_account_secrets;
CREATE POLICY calendar_google_account_secrets_deny_all ON public.calendar_google_account_secrets
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS calendar_google_oauth_states_deny_all ON public.calendar_google_oauth_states;
CREATE POLICY calendar_google_oauth_states_deny_all ON public.calendar_google_oauth_states
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS calendar_google_watch_channels_deny_all ON public.calendar_google_watch_channels;
CREATE POLICY calendar_google_watch_channels_deny_all ON public.calendar_google_watch_channels
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calendars;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
