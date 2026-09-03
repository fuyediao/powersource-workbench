/**
 * Minimal hand-written schema for the Supabase tables and RPCs this app
 * calls directly from the browser. Kept narrow (only the columns we query)
 * so the Supabase client stays fully typed without generated codegen.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: { id: string; position: number }
        Insert: { id: string; position: number }
        Update: Partial<{ id: string; position: number }>
        Relationships: []
      }
      sites: {
        Row: { id: string; url: string; name: string }
        Insert: { id?: string; url: string; name: string }
        Update: Partial<{ id: string; url: string; name: string }>
        Relationships: []
      }
      te_partner_departments: {
        Row: {
          id: string
          name: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          is_active: boolean
          updated_at: string
        }>
        Relationships: []
      }
      user_category_sites: {
        Row: { user_id: string; category_id: string; site_id: string; position: number }
        Insert: { user_id: string; category_id: string; site_id: string; position: number }
        Update: Partial<{
          user_id: string
          category_id: string
          site_id: string
          position: number
        }>
        Relationships: []
      }
      favorites: {
        Row: {
          id: string
          user_id: string
          shop_name: string
          latitude: number
          longitude: number
          address: string | null
          country: string | null
          state_province: string | null
          city: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          open_sunday: boolean | null
          hours: string | null
          website: string | null
          note: string | null
          image_urls: Json | null
          tags: Json | null
          priority: string | null
          group_id: string | null
          created_by_user_id: string | null
          created_at: string
          updated_at: string
          last_modified_by_user_id: string | null
          last_modified_by_email: string | null
          last_modified_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          shop_name: string
          latitude: number
          longitude: number
          address?: string | null
          country?: string | null
          state_province?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          open_sunday?: boolean | null
          hours?: string | null
          website?: string | null
          note?: string | null
          image_urls?: Json | null
          tags?: Json | null
          priority?: string | null
          group_id?: string | null
          created_by_user_id?: string | null
          created_at?: string
          updated_at?: string
          last_modified_by_user_id?: string | null
          last_modified_by_email?: string | null
          last_modified_at?: string | null
        }
        Update: Partial<{
          shop_name: string
          latitude: number
          longitude: number
          address: string | null
          country: string | null
          state_province: string | null
          city: string | null
          address_line1: string | null
          address_line2: string | null
          postal_code: string | null
          open_sunday: boolean | null
          hours: string | null
          website: string | null
          note: string | null
          image_urls: Json | null
          tags: Json | null
          priority: string | null
          group_id: string | null
          updated_at: string
          last_modified_by_user_id: string | null
          last_modified_by_email: string | null
          last_modified_at: string | null
        }>
        Relationships: []
      }
      history: {
        Row: {
          id: string
          user_id: string
          query: string
          messages: Json | null
          locations: Json | null
          search_location: Json | null
          group_id: string | null
          created_by_user_id: string | null
          assistant_kind: 'ask' | 'agent'
          harness_thread_id: string | null
          harness_items: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          query: string
          messages?: Json | null
          locations?: Json | null
          search_location?: Json | null
          group_id?: string | null
          created_by_user_id?: string | null
          assistant_kind?: 'ask' | 'agent'
          harness_thread_id?: string | null
          harness_items?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          query: string
          messages: Json | null
          locations: Json | null
          search_location: Json | null
          group_id: string | null
          created_by_user_id: string | null
          assistant_kind: 'ask' | 'agent'
          harness_thread_id?: string | null
          harness_items?: Json | null
          updated_at: string
        }>
        Relationships: []
      }
      search_history: {
        Row: {
          id: string
          user_id: string
          query: string
          engine: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          query: string
          engine: string
          created_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          query: string
          engine: string
          created_at: string
        }>
        Relationships: []
      }
      market_assets: {
        Row: {
          user_id: string
          position: number
          asset_id: string
          symbol: string
          name: string
          kind: string
        }
        Insert: {
          user_id: string
          position: number
          asset_id: string
          symbol: string
          name: string
          kind: string
        }
        Update: Partial<{
          user_id: string
          position: number
          asset_id: string
          symbol: string
          name: string
          kind: string
        }>
        Relationships: []
      }
      calendar_events: {
        Row: {
          id: string
          title: string
          description: string | null
          start_at: string
          end_at: string
          all_day: boolean
          owner_user_id: string | null
          group_id: string | null
          created_by: string
          created_at: string
          updated_at: string
          source: string
          google_event_id: string | null
          google_calendar_id: string | null
          google_etag: string | null
          google_updated_at: string | null
          calendar_id: string | null
          rrule: string | null
          exdate: string[]
        }
        Insert: {
          id?: string
          title?: string
          description?: string | null
          start_at: string
          end_at: string
          all_day?: boolean
          owner_user_id?: string | null
          group_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
          source?: string
          google_event_id?: string | null
          google_calendar_id?: string | null
          google_etag?: string | null
          google_updated_at?: string | null
          calendar_id?: string | null
          rrule?: string | null
          exdate?: string[]
        }
        Update: Partial<{
          title: string
          description: string | null
          start_at: string
          end_at: string
          all_day: boolean
          owner_user_id: string | null
          group_id: string | null
          updated_at: string
          source: string
          google_event_id: string | null
          google_calendar_id: string | null
          google_etag: string | null
          google_updated_at: string | null
          calendar_id: string | null
          rrule: string | null
          exdate: string[]
        }>
        Relationships: []
      }
      calendars: {
        Row: {
          id: string
          name: string
          color: string
          owner_user_id: string | null
          group_id: string | null
          is_default: boolean
          google_calendar_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string
          color?: string
          owner_user_id?: string | null
          group_id?: string | null
          is_default?: boolean
          google_calendar_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          color: string
          is_default: boolean
          google_calendar_id: string | null
          updated_at: string
        }>
        Relationships: []
      }
      calendar_event_attendees: {
        Row: {
          id: string
          event_id: string
          user_id: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          user_id: string
          status?: string
          created_at?: string
        }
        Update: Partial<{
          status: string
        }>
        Relationships: []
      }
      calendar_google_accounts: {
        Row: {
          id: string
          owner_user_id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          google_calendar_id: string
          oauth_scope: string | null
          status: string
          error_message: string | null
          last_sync_at: string | null
          selected_google_calendar_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          email: string
          display_name?: string | null
          avatar_url?: string | null
          google_calendar_id?: string
          oauth_scope?: string | null
          status?: string
          error_message?: string | null
          last_sync_at?: string | null
          selected_google_calendar_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          email: string
          display_name: string | null
          avatar_url: string | null
          google_calendar_id: string
          oauth_scope: string | null
          status: string
          error_message: string | null
          last_sync_at: string | null
          selected_google_calendar_ids: string[]
          updated_at: string
        }>
        Relationships: []
      }
      user_settings: {
        Row: {
          user_id: string
          search_engine: string
          panel_opacity: number
          background_opacity: number
          background_path: string | null
          appearance_theme: string
          accent_hue: string
          accent_shade: number
          icon_radius: number
          clock_accent_hue: string
          clock_accent_shade: number
          wallpaper_rotate_enabled: boolean
          wallpaper_rotate_seconds: number
          show_weather: boolean
          show_markets: boolean
          show_news: boolean
          show_todo: boolean
          show_currency: boolean
          show_schedule: boolean
          show_mail: boolean
          show_focus: boolean
          show_apps: boolean
          peek_apps: boolean
          search_radius: number
          search_panel_opacity: number
          currency_from: string
          currency_to: string
          weather_latitude: number | null
          weather_longitude: number | null
          weather_place: string | null
          weather_source: string | null
          aside_widget_order: string[]
          aside_widget_order_left: string[]
          aside_widget_order_right: string[]
        }
        Insert: {
          user_id: string
          search_engine?: string
          panel_opacity?: number
          background_opacity?: number
          background_path?: string | null
          appearance_theme?: string
          accent_hue?: string
          accent_shade?: number
          icon_radius?: number
          clock_accent_hue?: string
          clock_accent_shade?: number
          wallpaper_rotate_enabled?: boolean
          wallpaper_rotate_seconds?: number
          show_weather?: boolean
          show_markets?: boolean
          show_news?: boolean
          show_todo?: boolean
          show_currency?: boolean
          show_schedule?: boolean
          show_mail?: boolean
          show_focus?: boolean
          show_apps?: boolean
          peek_apps?: boolean
          search_radius?: number
          search_panel_opacity?: number
          currency_from?: string
          currency_to?: string
          weather_latitude?: number | null
          weather_longitude?: number | null
          weather_place?: string | null
          weather_source?: string | null
          aside_widget_order?: string[]
          aside_widget_order_left?: string[]
          aside_widget_order_right?: string[]
        }
        Update: Partial<{
          user_id: string
          search_engine: string
          panel_opacity: number
          background_opacity: number
          background_path: string | null
          appearance_theme: string
          accent_hue: string
          accent_shade: number
          icon_radius: number
          clock_accent_hue: string
          clock_accent_shade: number
          wallpaper_rotate_enabled: boolean
          wallpaper_rotate_seconds: number
          show_weather: boolean
          show_markets: boolean
          show_news: boolean
          show_todo: boolean
          show_currency: boolean
          show_schedule: boolean
          show_mail: boolean
          show_focus: boolean
          show_apps: boolean
          peek_apps: boolean
          search_radius: number
          search_panel_opacity: number
          currency_from: string
          currency_to: string
          weather_latitude: number | null
          weather_longitude: number | null
          weather_place: string | null
          weather_source: string | null
          aside_widget_order: string[]
          aside_widget_order_left: string[]
          aside_widget_order_right: string[]
        }>
        Relationships: []
      }
      todos: {
        Row: {
          id: string
          user_id: string
          text: string
          done: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          text: string
          done?: boolean
          position?: number
          created_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          text: string
          done: boolean
          position: number
          created_at: string
        }>
        Relationships: []
      }
      user_wallpapers: {
        Row: {
          id: string
          user_id: string
          storage_path: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          storage_path: string
          created_at?: string
        }
        Update: Partial<{
          id: string
          user_id: string
          storage_path: string
          created_at: string
        }>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          full_name: string | null
          language: string | null
          organization: string | null
          bio: string | null
          phone_number: string | null
          phone_country: string | null
          avatar_url: string | null
          avatar_index: number | null
          employee_id: string | null
          openai_api_key: string | null
          anthropic_api_key: string | null
          gemini_api_key: string | null
          grok_api_key: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          full_name?: string | null
          language?: string | null
          organization?: string | null
          bio?: string | null
          phone_number?: string | null
          phone_country?: string | null
          avatar_url?: string | null
          avatar_index?: number | null
          employee_id?: string | null
          openai_api_key?: string | null
          anthropic_api_key?: string | null
          gemini_api_key?: string | null
          grok_api_key?: string | null
          updated_at?: string | null
        }
        Update: Partial<{
          email: string | null
          display_name: string | null
          full_name: string | null
          language: string | null
          organization: string | null
          bio: string | null
          phone_number: string | null
          phone_country: string | null
          avatar_url: string | null
          avatar_index: number | null
          employee_id: string | null
          openai_api_key: string | null
          anthropic_api_key: string | null
          gemini_api_key: string | null
          grok_api_key: string | null
          updated_at: string | null
        }>
        Relationships: []
      }
      user_roles: {
        Row: {
          user_id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          user_id: string
          role: string
          updated_at?: string | null
        }
        Update: Partial<{
          role: string
          updated_at: string | null
        }>
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          description: string | null
          group_admin_id: string | null
          is_temp_managed: boolean | null
          pending_admin_email: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          group_admin_id?: string | null
          is_temp_managed?: boolean | null
          pending_admin_email?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: Partial<{
          name: string
          description: string | null
          group_admin_id: string | null
          is_temp_managed: boolean | null
          pending_admin_email: string | null
          updated_at: string | null
        }>
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          status: string | null
          is_active: boolean | null
          is_group_admin: boolean | null
          added_at: string | null
          joined_at: string | null
          removed_at: string | null
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          status?: string | null
          is_active?: boolean | null
          is_group_admin?: boolean | null
          added_at?: string | null
          joined_at?: string | null
          removed_at?: string | null
        }
        Update: Partial<{
          status: string | null
          is_active: boolean | null
          is_group_admin: boolean | null
          removed_at: string | null
        }>
        Relationships: []
      }
      group_invitations: {
        Row: {
          id: string
          group_id: string
          email: string
          status: string | null
          invited_by_user_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          group_id: string
          email: string
          status?: string | null
          invited_by_user_id?: string | null
          created_at?: string | null
        }
        Update: Partial<{
          status: string | null
          invited_by_user_id: string | null
        }>
        Relationships: []
      }
      group_module_access: {
        Row: {
          group_id: string
          module_key: string
          granted_by: string | null
        }
        Insert: {
          group_id: string
          module_key: string
          granted_by?: string | null
        }
        Update: Partial<{
          module_key: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_member_module_writes: {
        Row: {
          group_id: string
          user_id: string
          module_key: string
          action: string
          granted_by: string | null
        }
        Insert: {
          group_id: string
          user_id: string
          module_key: string
          action: string
          granted_by?: string | null
        }
        Update: Partial<{
          module_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      global_leaders: {
        Row: {
          id: string
          user_id: string
          appointed_by: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          appointed_by?: string | null
          created_at?: string | null
        }
        Update: Partial<{
          appointed_by: string | null
        }>
        Relationships: []
      }
      global_leader_module_access: {
        Row: {
          user_id: string
          module_key: string
          granted_by: string | null
        }
        Insert: {
          user_id: string
          module_key: string
          granted_by?: string | null
        }
        Update: Partial<{
          module_key: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_module_access: {
        Row: {
          group_id: string
          module_key: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          module_key: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          module_key: string
          granted_by: string | null
        }>
        Relationships: []
      }
      global_leader_desktop_module_access: {
        Row: {
          user_id: string
          module_key: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          module_key: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          module_key: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_admin: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_orders: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_products: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_nexdot: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_te: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_folio: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_calendar: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_office: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      office_files: {
        Row: {
          id: string
          kind: 'docs' | 'sheets' | 'slides'
          name: string
          storage_path: string
          color: string | null
          owner_user_id: string | null
          group_id: string | null
          created_by: string | null
          updated_by: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          kind: 'docs' | 'sheets' | 'slides'
          name?: string
          storage_path: string
          color?: string | null
          owner_user_id?: string | null
          group_id?: string | null
          created_by?: string | null
          updated_by?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          kind: 'docs' | 'sheets' | 'slides'
          name: string
          storage_path: string
          color: string | null
          owner_user_id: string | null
          group_id: string | null
          updated_by: string | null
          sort_order: number
          updated_at: string
        }>
        Relationships: []
      }
      group_desktop_writes_aura: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      group_desktop_writes_team: {
        Row: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by: string | null
          created_at: string
        }
        Insert: {
          group_id: string
          user_id: string
          resource_key: string
          action: string
          granted_by?: string | null
          created_at?: string
        }
        Update: Partial<{
          resource_key: string
          action: string
          granted_by: string | null
        }>
        Relationships: []
      }
      aura_files: {
        Row: {
          id: string
          name: string
          storage_path: string
          color: string | null
          owner_user_id: string | null
          group_id: string | null
          created_by: string | null
          updated_by: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string
          storage_path: string
          color?: string | null
          owner_user_id?: string | null
          group_id?: string | null
          created_by?: string | null
          updated_by?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          name: string
          storage_path: string
          color: string | null
          owner_user_id: string | null
          group_id: string | null
          updated_by: string | null
          sort_order: number
          updated_at: string
        }>
        Relationships: []
      }
      folio_pages: {
        Row: {
          id: string
          title: string
          parent_id: string | null
          owner_user_id: string | null
          group_id: string | null
          yjs_state: string | null
          deleted_at: string | null
          primary_mode: 'page' | 'edgeless'
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title?: string
          parent_id?: string | null
          owner_user_id?: string | null
          group_id?: string | null
          yjs_state?: string | null
          deleted_at?: string | null
          primary_mode?: 'page' | 'edgeless'
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<{
          title: string
          parent_id: string | null
          owner_user_id: string | null
          group_id: string | null
          yjs_state: string | null
          deleted_at: string | null
          primary_mode: 'page' | 'edgeless'
          sort_order: number
          updated_at: string
        }>
        Relationships: []
      }
      folio_page_favorites: {
        Row: {
          user_id: string
          page_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          page_id: string
          created_at?: string
        }
        Update: never
        Relationships: []
      }
      folio_page_versions: {
        Row: {
          id: string
          page_id: string
          yjs_state: string
          title: string
          created_at: string
          created_by: string
        }
        Insert: {
          id?: string
          page_id: string
          yjs_state: string
          title?: string
          created_at?: string
          created_by?: string
        }
        Update: never
        Relationships: []
      }
      folio_page_updates: {
        Row: {
          id: number
          page_id: string
          update: string
          created_at: string
        }
        Insert: {
          id?: number
          page_id: string
          update: string
          created_at?: string
        }
        Update: Partial<{
          page_id: string
          update: string
        }>
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          group_id: string | null
          created_by_user_id: string | null
          company_name: string
          contact_name: string | null
          phone: string | null
          phone_country: string | null
          email: string | null
          note: string | null
          address: string | null
          latitude: number | null
          longitude: number | null
          customer_code: string | null
          short_name: string | null
          category: string | null
          customer_type: string | null
          owner_user_id: string | null
          website: string | null
          tax_id: string | null
          fax: string | null
          fax_country: string | null
          industry: string | null
          employee_count: number | null
          primary_contact_name: string | null
          description: string | null
          company_country: string | null
          company_state: string | null
          company_city: string | null
          company_postal_code: string | null
          company_address_line1: string | null
          company_address_line2: string | null
          customer_channel: string | null
          customer_attribute: string | null
          market_segment: string | null
          market_sub_segment: string | null
          customer_source: string | null
          customer_level: string | null
          payment_cycle: string | null
          relationship_start_date: string | null
          credit_limit: number | null
          payment_method: string | null
          currency: string | null
          price_type: string | null
          job_title: string | null
          handler_department: string | null
          handler_developer: string | null
          handler_follower: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          group_id?: string | null
          created_by_user_id?: string | null
          company_name: string
          contact_name?: string | null
          phone?: string | null
          phone_country?: string | null
          email?: string | null
          note?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          customer_code?: string | null
          short_name?: string | null
          category?: string | null
          customer_type?: string | null
          owner_user_id?: string | null
          website?: string | null
          tax_id?: string | null
          fax?: string | null
          fax_country?: string | null
          industry?: string | null
          employee_count?: number | null
          primary_contact_name?: string | null
          description?: string | null
          company_country?: string | null
          company_state?: string | null
          company_city?: string | null
          company_postal_code?: string | null
          company_address_line1?: string | null
          company_address_line2?: string | null
          customer_channel?: string | null
          customer_attribute?: string | null
          market_segment?: string | null
          market_sub_segment?: string | null
          customer_source?: string | null
          customer_level?: string | null
          payment_cycle?: string | null
          relationship_start_date?: string | null
          credit_limit?: number | null
          payment_method?: string | null
          currency?: string | null
          price_type?: string | null
          job_title?: string | null
          handler_department?: string | null
          handler_developer?: string | null
          handler_follower?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string | null
          created_by_user_id?: string | null
          company_name?: string
          contact_name?: string | null
          phone?: string | null
          phone_country?: string | null
          email?: string | null
          note?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          customer_code?: string | null
          short_name?: string | null
          category?: string | null
          customer_type?: string | null
          owner_user_id?: string | null
          website?: string | null
          tax_id?: string | null
          fax?: string | null
          fax_country?: string | null
          industry?: string | null
          employee_count?: number | null
          primary_contact_name?: string | null
          description?: string | null
          company_country?: string | null
          company_state?: string | null
          company_city?: string | null
          company_postal_code?: string | null
          company_address_line1?: string | null
          company_address_line2?: string | null
          customer_channel?: string | null
          customer_attribute?: string | null
          market_segment?: string | null
          market_sub_segment?: string | null
          customer_source?: string | null
          customer_level?: string | null
          payment_cycle?: string | null
          relationship_start_date?: string | null
          credit_limit?: number | null
          payment_method?: string | null
          currency?: string | null
          price_type?: string | null
          job_title?: string | null
          handler_department?: string | null
          handler_developer?: string | null
          handler_follower?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_contacts: {
        Row: {
          id: string
          customer_id: string
          group_id: string | null
          name: string
          title: string | null
          email: string | null
          phone: string | null
          phone_country: string | null
          mobile: string | null
          mobile_country: string | null
          remarks: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          group_id?: string | null
          name: string
          title?: string | null
          email?: string | null
          phone?: string | null
          phone_country?: string | null
          mobile?: string | null
          mobile_country?: string | null
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          group_id?: string | null
          name?: string
          title?: string | null
          email?: string | null
          phone?: string | null
          phone_country?: string | null
          mobile?: string | null
          mobile_country?: string | null
          remarks?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_work_items: {
        Row: {
          id: string
          customer_id: string
          group_id: string | null
          item_code: string | null
          subject: string
          due_date: string | null
          start_at: string | null
          expected_end_at: string | null
          assignee_name: string | null
          importance: string | null
          completed: boolean
          remarks: string | null
          suggestion: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          group_id?: string | null
          item_code?: string | null
          subject: string
          due_date?: string | null
          start_at?: string | null
          expected_end_at?: string | null
          assignee_name?: string | null
          importance?: string | null
          completed?: boolean
          remarks?: string | null
          suggestion?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          group_id?: string | null
          item_code?: string | null
          subject?: string
          due_date?: string | null
          start_at?: string | null
          expected_end_at?: string | null
          assignee_name?: string | null
          importance?: string | null
          completed?: boolean
          remarks?: string | null
          suggestion?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_shops: {
        Row: {
          id: string
          group_id: string
          store_name: string
          country: string | null
          state_province: string | null
          city: string | null
          address_line1: string | null
          latitude: number | null
          longitude: number | null
          importance_level: string | null
          created_at: string | null
        }
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      bsc_documents: {
        Row: {
          id: string
          group_id: string
          fiscal_year: number
          period_month: number
          strategic_vision: string | null
          strategic_description: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          fiscal_year: number
          period_month: number
          strategic_vision?: string | null
          strategic_description?: string | null
          created_by?: string | null
        }
        Update: Partial<{
          strategic_vision: string | null
          strategic_description: string | null
        }>
        Relationships: []
      }
      bsc_goals: {
        Row: {
          id: string
          document_id: string
          dimension: string
          name: string | null
          description: string | null
          weight_percent: number | null
          responsibility: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_id: string
          dimension: string
          name: string
          description?: string | null
          weight_percent?: number | null
          responsibility?: string | null
          sort_order?: number
        }
        Update: Partial<{
          dimension: string
          name: string
          description: string | null
          weight_percent: number | null
          responsibility: string | null
          sort_order: number
        }>
        Relationships: []
      }
      bsc_kpis: {
        Row: {
          id: string
          goal_id: string
          name: string | null
          formula: string | null
          target_value: string | null
          current_value: string | null
          data_source: string | null
          weight_percent: number | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          goal_id: string
          name: string
          formula?: string | null
          target_value?: string | null
          current_value?: string | null
          data_source?: string | null
          weight_percent?: number | null
          sort_order?: number
        }
        Update: Partial<{
          name: string
          formula: string | null
          target_value: string | null
          current_value: string | null
          data_source: string | null
          weight_percent: number | null
          sort_order: number
        }>
        Relationships: []
      }
      pbc_documents: {
        Row: {
          id: string
          group_id: string
          scope: string
          subject_user_id: string | null
          fiscal_year: number
          period_month: number
          valid_from: string | null
          valid_to: string | null
          committer_display_name: string | null
          department_label: string | null
          position_label: string | null
          overall_direction: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_id: string
          scope: string
          subject_user_id?: string | null
          fiscal_year: number
          period_month: number
          valid_from?: string | null
          valid_to?: string | null
          committer_display_name?: string | null
          department_label?: string | null
          position_label?: string | null
          overall_direction?: string | null
          created_by?: string | null
        }
        Update: Partial<{
          committer_display_name: string | null
          department_label: string | null
          position_label: string | null
          overall_direction: string | null
          valid_from: string | null
          valid_to: string | null
        }>
        Relationships: []
      }
      pbc_rows: {
        Row: {
          id: string
          document_id: string
          part: string
          sort_order: number
          row_kind: string | null
          code: string | null
          title: string | null
          annual_target: string | null
          milestones: Json | null
          definition: string | null
          weight_percent: number | null
          evaluation_period: string | null
          current_progress: string | null
          self_evaluation: string | null
          manager_evaluation: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          document_id: string
          part: string
          sort_order?: number
          row_kind?: string | null
          code?: string | null
          title?: string | null
          annual_target?: string | null
          milestones?: Json | null
          definition?: string | null
          weight_percent?: number | null
          evaluation_period?: string | null
          current_progress?: string | null
          self_evaluation?: string | null
          manager_evaluation?: string | null
        }
        Update: Partial<{
          code: string | null
          title: string | null
          annual_target: string | null
          milestones: Json | null
          definition: string | null
          weight_percent: number | null
          evaluation_period: string | null
          current_progress: string | null
          self_evaluation: string | null
          manager_evaluation: string | null
        }>
        Relationships: []
      }
      team_retro_boards: {
        Row: {
          id: string
          group_id: string
          fiscal_year: number
          period_month: number
          board_payload: Json
          created_at?: string
          updated_at?: string
        }
        Insert: {
          id?: string
          group_id: string
          fiscal_year: number
          period_month: number
          board_payload: Json
        }
        Update: Partial<{
          board_payload: Json
        }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      ensure_user_library: {
        Args: Record<string, never>
        Returns: undefined
      }
      folio_compact_page_updates: {
        Args: { p_page_id: string; p_merged_state: string; p_up_to_id: number }
        Returns: undefined
      }
      pbc_init_default_rows: {
        Args: { p_document_id: string }
        Returns: unknown
      }
      rpc_set_group_admin: {
        Args: { p_group_id: string; p_user_id: string; p_is_admin: boolean }
        Returns: unknown
      }
      rpc_add_user_to_group: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: unknown
      }
      rpc_activate_pending_group_admin: {
        Args: Record<string, never>
        Returns: unknown
      }
      rpc_consume_stuck_invitations: {
        Args: { p_group_id?: string; p_email?: string }
        Returns: unknown
      }
      rpc_set_system_admin: {
        Args: { p_user_id: string; p_is_admin: boolean }
        Returns: unknown
      }
    }
  }
}
