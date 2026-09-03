/**
 * KOL detail tab chrome: one row when wide enough; otherwise two equal-width rows.
 * Breakpoints are language-specific (CJK labels are shorter than English).
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KOL_DETAIL_TAB_ALL,
  KOL_DETAIL_TAB_LABEL_KEY,
  KOL_DETAIL_TAB_ROW1,
  KOL_DETAIL_TAB_ROW2,
  type KolDetailTabId,
} from '@/components/admin/kol-detail/detail-shared'

/** Host width below which Chinese UI uses two tab rows. */
const TWO_ROWS_MAX_WIDTH_CJK = 820
/** Host width below which English UI uses two tab rows. */
const TWO_ROWS_MAX_WIDTH_EN = 1240

interface KolDetailTabBarProps {
  activeTab: KolDetailTabId
  onChange: (tab: KolDetailTabId) => void
}

/**
 * Returns the single-row minimum width for the active UI language.
 * @param language - i18n language code.
 * @returns Breakpoint in CSS pixels.
 */
function twoRowsMaxWidth(language: string): number {
  const base = language.toLowerCase()
  if (base.startsWith('zh')) {
    return TWO_ROWS_MAX_WIDTH_CJK
  }
  return TWO_ROWS_MAX_WIDTH_EN
}

/**
 * Renders KOL detail tabs in one row when the host is wide enough; otherwise two rows.
 * @param props - Active tab and change handler.
 * @returns Tab bar.
 */
export function KolDetailTabBar({ activeTab, onChange }: KolDetailTabBarProps) {
  const { t, i18n } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const [twoRows, setTwoRows] = useState(true)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    const breakpoint = twoRowsMaxWidth(i18n.resolvedLanguage || i18n.language)

    /**
     * Uses a language-specific width threshold for one vs two rows.
     * @returns Nothing.
     */
    function updateLayout(): void {
      if (!host) {
        return
      }
      setTwoRows(host.clientWidth < breakpoint)
    }

    updateLayout()
    const observer = new ResizeObserver(() => updateLayout())
    observer.observe(host)
    return () => observer.disconnect()
  }, [i18n.language, i18n.resolvedLanguage])

  /**
   * Renders a grid row of equal-width tab buttons.
   * @param tabs - Tab ids for the row.
   * @returns Row element.
   */
  function renderGrid(tabs: KolDetailTabId[]) {
    return (
      <div
        className="grid gap-0 border-b border-ink/10"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tabId) => {
          const active = activeTab === tabId
          return (
            <button
              key={tabId}
              type="button"
              className={`w-full border-b-2 px-1 py-2.5 text-center text-sm font-semibold transition-colors sm:px-2 ${
                active
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
              onClick={() => onChange(tabId)}
            >
              <span className="block truncate">{t(KOL_DETAIL_TAB_LABEL_KEY[tabId])}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={hostRef} className="relative">
      {twoRows ? (
        <div>
          {renderGrid(KOL_DETAIL_TAB_ROW1)}
          {renderGrid(KOL_DETAIL_TAB_ROW2)}
        </div>
      ) : (
        renderGrid(KOL_DETAIL_TAB_ALL)
      )}
    </div>
  )
}
