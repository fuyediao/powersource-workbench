-- Remove the desktop_agent module key from group desktop access.
-- Ask (desktop_chat), Mail, and Calendar stay. English comments only. Idempotent.

DELETE FROM public.group_desktop_module_access
WHERE module_key = 'desktop_agent';

ALTER TABLE public.group_desktop_module_access
  DROP CONSTRAINT IF EXISTS group_desktop_module_access_module_key_check;

ALTER TABLE public.group_desktop_module_access
  ADD CONSTRAINT group_desktop_module_access_module_key_check CHECK (module_key = ANY (ARRAY[
    'desktop_chat',
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
  ]));

NOTIFY pgrst, 'reload schema';
