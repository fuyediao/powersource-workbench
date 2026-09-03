import { useState, type ComponentType, type SVGProps } from 'react'
import {
  getAppIconUrl,
  getLetterFallbackColor,
  isPlaceholderFavicon,
} from '@/utils/home/icon'
import { isFunctionsCategory } from '@/constants/rail-categories'
import {
  AdminAppsIcon,
  ArtificialIntelligenceIcon,
  AuraMarkdownIcon,
  CalendarIcon,
  ClashIcon,
  FolioIcon,
  HarnessIcon,
  KanbanIcon,
  LucideBookOpenIcon,
  LucideClipboardCheckIcon,
  LucidePackageIcon,
  LucideStoreIcon,
  MailIcon,
  MapIcon,
  MessageSquareIcon,
  NexdotWordmarkIcon,
  NextorchBrandIcon,
  PowersourceBrandIcon,
  SettingsIcon,
  UniverDocsIcon,
  UniverSheetsIcon,
  UniverSlidesIcon,
  UsersIcon,
} from '@/icons/AllIcons'
import type { AppItem } from '@/types/library'

interface AppIconProps {
  app: AppItem
  label: string
  compact?: boolean
}

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>

interface FunctionSvgConfig {
  Icon: SvgIcon
  /** Classes applied to the SVG (size / brand colors). */
  iconClass: string
}

/** Built-in Function tiles with vector icons (not remote favicons). */
const FUNCTION_SVG_ICONS: Record<string, FunctionSvgConfig> = {
  'function-ask': {
    Icon: ArtificialIntelligenceIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-messages': {
    Icon: MessageSquareIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-mail': {
    Icon: MailIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-calendar': {
    Icon: CalendarIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-kanban': {
    Icon: KanbanIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-map': {
    Icon: MapIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-admin': {
    Icon: AdminAppsIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-orders': {
    Icon: LucidePackageIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-products': {
    Icon: LucideBookOpenIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-nexdot-app': {
    Icon: LucideStoreIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-te-admin': {
    Icon: LucideClipboardCheckIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-team': {
    Icon: UsersIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-settings': {
    Icon: SettingsIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-aura': {
    Icon: AuraMarkdownIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-folio': {
    Icon: FolioIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-docs': {
    Icon: UniverDocsIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-sheets': {
    Icon: UniverSheetsIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-slides': {
    Icon: UniverSlidesIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-clash': {
    Icon: ClashIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-harness': {
    Icon: HarnessIcon,
    iconClass: 'size-6 sm:size-7 text-brand',
  },
  'function-nextorch': {
    Icon: NextorchBrandIcon,
    iconClass: 'h-[58%] w-auto text-brand',
  },
  'function-oa': {
    Icon: PowersourceBrandIcon,
    iconClass: 'h-[72%] w-[72%]',
  },
  'function-erp': {
    Icon: PowersourceBrandIcon,
    iconClass: 'h-[72%] w-[72%]',
  },
  'function-nexdot': {
    Icon: NexdotWordmarkIcon,
    iconClass: 'h-[62%] w-[62%] text-brand',
  },
}

const FUNCTION_SVG_ICONS_COMPACT: Record<string, string> = {
  'function-ask': 'size-3.5 sm:size-4 text-brand',
  'function-messages': 'size-3.5 sm:size-4 text-brand',
  'function-mail': 'size-3.5 sm:size-4 text-brand',
  'function-calendar': 'size-3.5 sm:size-4 text-brand',
  'function-kanban': 'size-3.5 sm:size-4 text-brand',
  'function-map': 'size-3.5 sm:size-4 text-brand',
  'function-admin': 'size-3.5 sm:size-4 text-brand',
  'function-orders': 'size-3.5 sm:size-4 text-brand',
  'function-products': 'size-3.5 sm:size-4 text-brand',
  'function-nexdot-app': 'size-3.5 sm:size-4 text-brand',
  'function-te-admin': 'size-3.5 sm:size-4 text-brand',
  'function-team': 'size-3.5 sm:size-4 text-brand',
  'function-settings': 'size-3.5 sm:size-4 text-brand',
  'function-aura': 'size-3.5 sm:size-4 text-brand',
  'function-folio': 'size-3.5 sm:size-4 text-brand',
  'function-docs': 'size-3.5 sm:size-4 text-brand',
  'function-sheets': 'size-3.5 sm:size-4 text-brand',
  'function-slides': 'size-3.5 sm:size-4 text-brand',
  'function-clash': 'size-3.5 sm:size-4 text-brand',
  'function-harness': 'size-3.5 sm:size-4 text-brand',
  'function-nextorch': 'h-[70%] w-auto text-brand',
  'function-oa': 'h-[78%] w-[78%]',
  'function-erp': 'h-[78%] w-[78%]',
  'function-nexdot': 'h-[68%] w-[68%] text-brand',
}

/**
 * Resolves the image source for an app tile.
 * Function tiles use the manually set `icon` only (never remote favicons).
 * @param app - App row.
 * @returns Icon URL, or null for letter / SVG fallback.
 */
function resolveIconSrc(app: AppItem): string | null {
  if (isFunctionsCategory(app.categoryId)) {
    return app.icon ?? null
  }
  return app.icon ?? getAppIconUrl(app.url)
}

/**
 * Renders a site icon: SVG for branded Function tiles, bundled/remote images
 * otherwise, with a colored letter fallback on failure.
 * Corner radius follows the theme `--app-icon-radius` setting.
 * @param props - App data, localized label, and compact rendering mode.
 * @returns Site icon.
 */
export function AppIcon({ app, label, compact = false }: AppIconProps) {
  const isFunction = isFunctionsCategory(app.categoryId)
  const svgConfig = FUNCTION_SVG_ICONS[app.id]
  const iconSrc = svgConfig ? null : resolveIconSrc(app)
  const [failed, setFailed] = useState<boolean>(iconSrc === null && !svgConfig)
  const fallbackColor = getLetterFallbackColor(label || app.id)
  const sizeClass = compact ? 'app-icon size-5 sm:size-6' : 'app-icon size-12 sm:size-14'
  const depthClass = compact
    ? 'shadow-sm'
    : 'shadow-[0_6px_14px_rgb(0_0_0/0.16),0_2px_4px_rgb(0_0_0/0.1)] dark:shadow-[0_6px_16px_rgb(0_0_0/0.45),0_2px_4px_rgb(0_0_0/0.35)]'

  if (svgConfig) {
    const { Icon } = svgConfig
    const iconClass = compact
      ? (FUNCTION_SVG_ICONS_COMPACT[app.id] ?? svgConfig.iconClass)
      : svgConfig.iconClass
    return (
      <span
        className={`${sizeClass} ${depthClass} grid place-items-center bg-white ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10`}
      >
        <Icon className={iconClass} aria-hidden />
      </span>
    )
  }

  if (failed || !iconSrc) {
    return (
      <span
        className={`${sizeClass} ${fallbackColor} ${depthClass} grid place-items-center font-bold text-white`}
      >
        {(label || app.id).slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={iconSrc}
      alt=""
      className={`${sizeClass} ${depthClass} bg-white object-cover ring-1 ring-zinc-950/5 dark:ring-white/10`}
      draggable={false}
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        // Function / bundled icons skip Google placeholder detection.
        if (!isFunction && !app.icon && isPlaceholderFavicon(event.currentTarget)) {
          setFailed(true)
        }
      }}
      onError={() => setFailed(true)}
    />
  )
}
