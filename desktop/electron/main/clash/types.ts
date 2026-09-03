/** Chain reference options carried on a profile (mirrors Clash Verge `PrfOption`). */
export type ClashProfileOption = {
  user_agent?: string
  with_proxy?: boolean
  self_proxy?: boolean
  update_interval?: number
  timeout_seconds?: number
  danger_accept_invalid_certs?: boolean
  allow_auto_update?: boolean
  /** Uid of a `merge` profile item to overlay (defaults to the global `Merge` item). */
  merge?: string
  /** Uid of a `script` profile item to run (defaults to the global `Script` item). */
  script?: string
  /** Uid of a `rules` seq item (prepend/append/delete). */
  rules?: string
  /** Uid of a `proxies` seq item. */
  proxies?: string
  /** Uid of a `groups` seq item. */
  groups?: string
}

/** Profile row persisted under userData/clash. */
export type ClashProfileItem = {
  uid: string
  type: 'local' | 'remote' | 'merge' | 'script'
  name: string
  desc?: string
  file: string
  url?: string
  updated: number
  option?: ClashProfileOption
  extra?: {
    upload: number
    download: number
    total: number
    expire: number
  }
}

/** Profiles index file. */
export type ClashProfilesIndex = {
  current?: string
  items: ClashProfileItem[]
}

/** Clash Verge core ids honored by the Electron sidecar host. */
export type ClashCoreName = 'verge-mihomo' | 'verge-mihomo-alpha'

/** Narrow Verge settings persisted beside profiles (superset of the frontend `IVergeConfig`). */
export type ClashVergeStore = {
  language?: string
  theme_mode?: 'light' | 'dark' | 'system'
  enable_system_proxy?: boolean
  clash_core?: ClashCoreName
  verge_mixed_port?: number
  verge_socks_port?: number
  verge_redir_port?: number
  verge_tproxy_port?: number
  verge_port?: number
  verge_redir_enabled?: boolean
  verge_tproxy_enabled?: boolean
  verge_socks_enabled?: boolean
  verge_http_enabled?: boolean
  start_page?: string
  traffic_graph?: boolean
  enable_memory_usage?: boolean
  enable_group_icon?: boolean
  collapse_navbar?: boolean
  auto_close_connection?: boolean
  menu_order?: string[]
  /** Persisted control-plane fields the app owns (survive a Mihomo restart). */
  clash_mode?: string
  clash_log_level?: string
  clash_ipv6?: boolean
  clash_allow_lan?: boolean
  clash_unified_delay?: boolean
  enable_tun_mode?: boolean
  enable_dns_settings?: boolean
  enable_builtin_enhanced?: boolean
  enable_external_controller?: boolean
  enable_auto_light_weight_mode?: boolean
  auto_light_weight_minutes?: number
  enable_auto_launch?: boolean
  enable_silent_start?: boolean
  enable_global_hotkey?: boolean
  hotkeys?: string[]
  proxy_auto_config?: boolean
  pac_file_content?: string
  proxy_host?: string
  system_proxy_bypass?: string
  webdav_url?: string
  webdav_username?: string
  webdav_password?: string
  enable_auto_backup_schedule?: boolean
  auto_backup_interval_hours?: number
  auto_backup_on_change?: boolean
  home_cards?: Record<string, boolean>
  test_list?: Array<{ uid: string; name?: string; icon?: string; url: string }>
}

/** Runtime snapshot for the Clash UI. */
export type ClashRunState = {
  mode: 'Service' | 'Sidecar' | 'NotRunning'
  service: 'unknown' | 'ready' | 'notInstalled' | 'versionMismatch' | 'unavailable'
  serviceUnavailableReason: string | null
  pendingAction: 'install' | 'uninstall' | 'reinstall' | 'forceReinstall' | null
  sidecarAllowed: boolean
  isAdmin: boolean
  opInFlight: boolean
  serviceUsable: boolean
  tunCapable: boolean
  serviceNeedsAttention: boolean
}

/** Outcome shape shared by profile / config validation commands. */
export type ClashValidationOutcome =
  | { status: 'valid' | 'busy' }
  | { status: 'invalid'; kind: string; message: string }
  | { status: 'skipped'; reason: string }
