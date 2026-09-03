import type { ComponentType, SVGProps } from 'react'
import {
  isFeatureTabId,
  isFolioPageTabId,
  type FeatureTabId,
} from '@/constants/feature-tabs'
import {
  AdminAppsIcon,
  ArtificialIntelligenceIcon,
  AuraMarkdownIcon,
  CalendarIcon,
  ClashIcon,
  FolioIcon,
  GlobeIcon,
  HarnessIcon,
  KanbanIcon,
  LucideBookOpenIcon,
  LucideClipboardCheckIcon,
  LucidePackageIcon,
  LucideStoreIcon,
  MailIcon,
  MapIcon,
  MessageSquareIcon,
  SettingsIcon,
  UniverDocsIcon,
  UniverSheetsIcon,
  UniverSlidesIcon,
  UsersIcon,
} from '@/icons/AllIcons'
import { isBrowserTabId } from '@/utils/settings/link-open-preference'

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>

/** Same glyphs as Home Function tiles, sized for the caption strip. */
const FEATURE_TAB_ICONS: Record<FeatureTabId, SvgIcon> = {
  chat: ArtificialIntelligenceIcon,
  messages: MessageSquareIcon,
  mail: MailIcon,
  calendar: CalendarIcon,
  kanban: KanbanIcon,
  map: MapIcon,
  admin: AdminAppsIcon,
  orders: LucidePackageIcon,
  products: LucideBookOpenIcon,
  nexdot: LucideStoreIcon,
  teAdmin: LucideClipboardCheckIcon,
  team: UsersIcon,
  aura: AuraMarkdownIcon,
  folio: FolioIcon,
  docs: UniverDocsIcon,
  sheets: UniverSheetsIcon,
  slides: UniverSlidesIcon,
  clash: ClashIcon,
  harness: HarnessIcon,
}

/**
 * Resolves the SVG for a title-bar tab. Home uses a separate chrome button.
 * @param tabId - Title-bar tab id.
 * @returns Icon component, or null when the tab has no glyph.
 */
export function titleBarIconForTab(tabId: string): SvgIcon | null {
  if (tabId === 'settings') {
    return SettingsIcon
  }
  if (isFeatureTabId(tabId)) {
    return FEATURE_TAB_ICONS[tabId]
  }
  if (isFolioPageTabId(tabId)) {
    return FolioIcon
  }
  if (isBrowserTabId(tabId)) {
    return GlobeIcon
  }
  return null
}
