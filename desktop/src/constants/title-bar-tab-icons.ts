import type { ComponentType, SVGProps } from 'react'
import {
  isFeatureTabId,
  isFolioPageTabId,
  type FeatureTabId,
} from '@/constants/feature-tabs'
import {
  ArtificialIntelligenceIcon,
  AuraMarkdownIcon,
  CalendarIcon,
  FolioIcon,
  GlobeIcon,
  HarnessIcon,
  MailIcon,
  SettingsIcon,
} from '@/icons/AllIcons'
import { isBrowserTabId } from '@/utils/settings/link-open-preference'

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>

/** Same glyphs as Home Function tiles, sized for the caption strip. */
const FEATURE_TAB_ICONS: Record<FeatureTabId, SvgIcon> = {
  chat: ArtificialIntelligenceIcon,
  mail: MailIcon,
  calendar: CalendarIcon,
  aura: AuraMarkdownIcon,
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
