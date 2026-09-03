/**
 * Customer map filter toolbar (isolated so opening menus does not re-render
 * the pin list). Country / US-state use shared CrmFilterSelect; level stays
 * a multi-select portal menu.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CountryFlag } from '@/components/common/country-flag'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CheckIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import {
  ALL_CUSTOMER_LEVEL_FILTER_KEYS,
  CUSTOMER_LEVEL_PIN_COLOR,
  CUSTOMER_LEVEL_PIN_FALLBACK,
  CUSTOMER_LEVEL_VALUES,
  type CustomerLevelFilterKey,
} from '@/constants/customer-levels'
import {
  US_STATE_OPTIONS,
  isUnitedStatesCountryFilter,
} from '@/constants/us-east-west-regions'
import { countryMatchesSearch } from '@/utils/map/country-alpha2'

const FILTER_MENU_PANEL =
  'fixed z-100 max-h-56 origin-top overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900'

const FILTER_MENU_LEAVE_MS = 180

interface MapCrmFilterToolbarProps {
  countryFilter: string
  usStateFilter: string
  selectedLevels: Set<CustomerLevelFilterKey>
  onCountryChange: (country: string) => void
  onUsStateChange: (code: string) => void
  onLevelsChange: (levels: Set<CustomerLevelFilterKey>) => void
}

/**
 * Country / US state / level filter triggers and menus.
 * @param props - Filter values and change handlers.
 * @returns Toolbar UI.
 */
export function MapCrmFilterToolbar({
  countryFilter,
  usStateFilter,
  selectedLevels,
  onCountryChange,
  onUsStateChange,
  onLevelsChange,
}: MapCrmFilterToolbarProps): ReactNode {
  const { t } = useTranslation()
  const [levelOpen, setLevelOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 224 })
  const toolbarRef = useRef<HTMLDivElement>(null)
  const levelTriggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const filterMenuPresence = useDialogPresence(levelOpen, FILTER_MENU_LEAVE_MS)

  const showUsStateFilter = isUnitedStatesCountryFilter(countryFilter)

  const countryOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('map.menubar.filterAllCountries') },
      { value: '__empty__', label: t('map.menubar.filterNoCountry') },
      ...COUNTRY_OPTIONS.map((name) => ({ value: name, label: name })),
    ],
    [t],
  )

  const usStateOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('map.menubar.filterAllUsStates') },
      ...US_STATE_OPTIONS.map((row) => ({
        value: row.code,
        label: `${row.code} — ${row.name}`,
      })),
    ],
    [t],
  )

  const allLevelsSelected = selectedLevels.size === ALL_CUSTOMER_LEVEL_FILTER_KEYS.length
  const levelLabel = allLevelsSelected
    ? t('map.menubar.filterAllLevels')
    : t('map.menubar.filterLevelsCount', { count: selectedLevels.size })

  /**
   * Positions the level portal menu under the level trigger.
   * @returns Nothing.
   */
  function syncMenuPos(): void {
    const trigger = levelTriggerRef.current
    if (!trigger) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    const width = Math.max(rect.width, 224)
    let left = rect.left
    const maxLeft = window.innerWidth - width - 8
    if (left > maxLeft) {
      left = Math.max(8, maxLeft)
    }
    setMenuPos({
      top: rect.bottom + 4,
      left,
      width,
    })
  }

  useLayoutEffect(() => {
    if (!levelOpen) {
      return
    }
    syncMenuPos()
  }, [levelOpen])

  useEffect(() => {
    if (!levelOpen) {
      return
    }
    /**
     * Repositions on viewport change.
     * @returns Nothing.
     */
    function onReposition(): void {
      syncMenuPos()
    }
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [levelOpen])

  useEffect(() => {
    if (!levelOpen) {
      return
    }
    /**
     * Closes the level menu on outside click.
     * @param event - Browser event.
     * @returns Nothing.
     */
    function onDocMouseDown(event: MouseEvent): void {
      const target = event.target as Node
      if (
        toolbarRef.current?.contains(target) ||
        menuRef.current?.contains(target) ||
        levelTriggerRef.current?.contains(target)
      ) {
        return
      }
      setLevelOpen(false)
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setLevelOpen(false)
      }
    }
    window.addEventListener('mousedown', onDocMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onDocMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [levelOpen])

  /**
   * Applies a country filter and clears US state when leaving the United States.
   * @param next - Selected country value.
   * @returns Nothing.
   */
  function handleCountryChange(next: string): void {
    onCountryChange(next)
    if (!isUnitedStatesCountryFilter(next)) {
      onUsStateChange('')
    }
  }

  /**
   * Toggles one customer level in the multi-select.
   * @param key - Level filter key.
   * @returns Nothing.
   */
  function toggleLevel(key: CustomerLevelFilterKey): void {
    const next = new Set(selectedLevels)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    onLevelsChange(next)
  }

  const levelMenu = filterMenuPresence.mounted
    ? createPortal(
        <div
          ref={menuRef}
          className={[
            FILTER_MENU_PANEL,
            filterMenuPresence.leaving
              ? 'animate-dropdown-out pointer-events-none'
              : 'animate-dropdown-in',
          ].join(' ')}
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs font-medium hover:bg-zinc-950/5 dark:hover:bg-white/5"
                onClick={() => {
                  onLevelsChange(
                    allLevelsSelected
                      ? new Set()
                      : new Set(ALL_CUSTOMER_LEVEL_FILTER_KEYS),
                  )
                }}
              >
                {allLevelsSelected
                  ? t('map.menubar.filterClearLevels')
                  : t('map.menubar.filterSelectAllLevels')}
              </button>
            </li>
            {CUSTOMER_LEVEL_VALUES.map((level) => {
              const checked = selectedLevels.has(level)
              return (
                <li key={level}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-950/5 dark:hover:bg-white/5"
                    onClick={() => toggleLevel(level)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CUSTOMER_LEVEL_PIN_COLOR[level] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{level}</span>
                    {checked ? (
                      <CheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                    ) : (
                      <span className="size-3.5 shrink-0" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-zinc-950/5 dark:hover:bg-white/5"
                onClick={() => toggleLevel('none')}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CUSTOMER_LEVEL_PIN_FALLBACK }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">{t('map.menubar.filterNoLevel')}</span>
                {selectedLevels.has('none') ? (
                  <CheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden />
                )}
              </button>
            </li>
          </ul>
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={toolbarRef} className="flex flex-wrap gap-1.5">
      <div
        className="min-w-0 flex-1 basis-[calc(50%-0.2rem)]"
        onPointerDown={() => setLevelOpen(false)}
      >
        <CrmFilterSelect
          size="sm"
          className="w-full"
          value={countryFilter}
          options={countryOptions}
          searchable
          searchPlaceholder={t('map.menubar.filterCountrySearch')}
          closeAriaLabel={t('common.inlineSearchComboboxClose')}
          emptyLabel={t('map.menubar.filterNoMatchingCountries')}
          ariaLabel={t('map.menubar.filterAllCountries')}
          renderLeading={(option) =>
            option.value && option.value !== '__empty__' ? (
              <CountryFlag countryName={option.value} size={14} />
            ) : null
          }
          filterOption={(option, query) => countryMatchesSearch(option.value, query)}
          onChange={handleCountryChange}
        />
      </div>

      {showUsStateFilter ? (
        <div
          className="min-w-0 flex-1 basis-[calc(50%-0.2rem)]"
          onPointerDown={() => setLevelOpen(false)}
        >
          <CrmFilterSelect
            size="sm"
            className="w-full"
            value={usStateFilter}
            options={usStateOptions}
            searchable
            searchPlaceholder={t('map.menubar.filterUsStateSearch')}
            closeAriaLabel={t('common.inlineSearchComboboxClose')}
            emptyLabel={t('map.menubar.filterNoMatchingUsStates')}
            ariaLabel={t('map.menubar.filterAllUsStates')}
            onChange={onUsStateChange}
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1 basis-[calc(50%-0.2rem)]">
        <button
          ref={levelTriggerRef}
          type="button"
          className="flex h-8 w-full items-center justify-between gap-1 rounded-md border border-zinc-950/10 bg-white px-2 text-left text-[11px] font-medium text-ink dark:border-white/10 dark:bg-zinc-950/40"
          aria-expanded={levelOpen}
          onClick={() => setLevelOpen((v) => !v)}
        >
          <span className="truncate">{levelLabel}</span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted" aria-hidden />
        </button>
      </div>
      {levelMenu}
    </div>
  )
}
