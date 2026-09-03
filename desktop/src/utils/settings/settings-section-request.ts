import type { SettingsSection } from '@/components/settings/settings-types'
import type { WidgetToolsSection } from '@/components/home/widgets/WidgetToolsPanel'

const OPEN_EVENT = 'geocrm:open-settings'
const SECTION_EVENT = 'geocrm:settings-section'
const WIDGET_TOOLS_EVENT = 'geocrm:widget-tools-section'

const WIDGET_TOOLS_SECTIONS: readonly WidgetToolsSection[] = [
  'order',
  'weather',
  'todo',
  'currency',
  'markets',
]

let pendingWidgetToolsSection: WidgetToolsSection | null = null

/**
 * Returns whether a value is a widget tools sub-section id.
 * @param value - Candidate id.
 * @returns True for known tools sections.
 */
export function isWidgetToolsSection(value: string): value is WidgetToolsSection {
  return (WIDGET_TOOLS_SECTIONS as readonly string[]).includes(value)
}

/**
 * Opens the GeoCRM Settings title-bar tab, optionally selecting a section
 * and Widgets tools sub-section.
 *
 * @param section - Optional settings section id (e.g. `widgets`).
 * @param widgetTools - Optional Widgets panel sub-section (order / weather / …).
 * @returns Nothing.
 */
export function openGeoCrmSettings(
  section?: SettingsSection,
  widgetTools?: WidgetToolsSection,
): void {
  if (widgetTools) {
    pendingWidgetToolsSection = widgetTools
    window.dispatchEvent(new CustomEvent(WIDGET_TOOLS_EVENT, { detail: widgetTools }))
  }
  if (section) {
    window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: section }))
  }
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * Reads and clears a pending Widgets tools sub-section (for Settings mount).
 * @returns Pending sub-section, or null.
 */
export function consumePendingWidgetToolsSection(): WidgetToolsSection | null {
  const next = pendingWidgetToolsSection
  pendingWidgetToolsSection = null
  return next
}

/**
 * Subscribe to Settings open requests (from Aura menu, deep links, etc.).
 *
 * @param listener - Callback when Settings should open.
 * @returns Unsubscribe function.
 */
export function subscribeOpenSettingsRequest(listener: () => void): () => void {
  const handler = (): void => {
    listener()
  }
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/**
 * Subscribe to Settings section selection requests.
 *
 * @param listener - Receives the requested section id.
 * @returns Unsubscribe function.
 */
export function subscribeSettingsSectionRequest(
  listener: (section: SettingsSection) => void,
): () => void {
  /**
   * @param event - Custom event with section detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<SettingsSection>).detail
    if (typeof detail === 'string') {
      listener(detail)
    }
  }
  window.addEventListener(SECTION_EVENT, handler)
  return () => window.removeEventListener(SECTION_EVENT, handler)
}

/**
 * Subscribe to Widgets tools sub-section selection requests.
 *
 * @param listener - Receives order / weather / todo / currency / markets.
 * @returns Unsubscribe function.
 */
export function subscribeWidgetToolsSectionRequest(
  listener: (section: WidgetToolsSection) => void,
): () => void {
  /**
   * @param event - Custom event with tools section detail.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<string>).detail
    if (typeof detail === 'string' && isWidgetToolsSection(detail)) {
      pendingWidgetToolsSection = null
      listener(detail)
    }
  }
  window.addEventListener(WIDGET_TOOLS_EVENT, handler)
  return () => window.removeEventListener(WIDGET_TOOLS_EVENT, handler)
}
