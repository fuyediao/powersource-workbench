import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from '@/icons/AllIcons'
import { getFlagSvg } from '@/icons/flags'
import {
  PHONE_COUNTRY_CODES,
  type PhoneCountryCode,
} from '@/constants/phone-country-codes'
import { combinePhoneParts, parsePhoneParts } from '@/utils/settings/phone-number-parts'
import { useDialogPresence } from '@/hooks/use-dialog-presence'

interface PhoneInputProps {
  /** Stored dial string, e.g. `+852 61224953`. */
  value: string
  /** ISO 3166-1 alpha-2 companion column. */
  countryCode: string
  /**
   * Called when dial string and/or ISO change.
   * @param nextValue - Combined dial string.
   * @param nextIso - ISO country code (may be empty).
   */
  onChange: (nextValue: string, nextIso: string) => void
  /** Disables picker and local input. */
  disabled?: boolean
  /** Read-only display (no picker interaction). */
  readOnly?: boolean
  id?: string
}

/**
 * Renders a country flag SVG from the bundled flag icon map.
 * @param props - ISO alpha-2 code and optional pixel size.
 * @returns Flag icon or null when missing.
 */
function PhoneFlagIcon({ code, size = 18 }: { code: string; size?: number }): ReactNode {
  const svg = getFlagSvg(code.toLowerCase())
  if (!svg) {
    return null
  }
  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-sm [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
      style={{ width: size, height: size, minWidth: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden
    />
  )
}

/**
 * Resolves dial prefix to a country row; +1 maps to United States.
 * @param dialCode - e.g. `+44`.
 * @returns Matching country or null.
 */
function countryFromDialCode(dialCode: string): PhoneCountryCode | null {
  const trimmed = dialCode.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed === '+1') {
    return PHONE_COUNTRY_CODES.find((c) => c.code === 'US') ?? null
  }
  return PHONE_COUNTRY_CODES.find((c) => c.dialCode === trimmed) ?? null
}

/**
 * Resolves ISO alpha-2 to a country row.
 * @param iso - ISO code.
 * @returns Matching country or null.
 */
function countryFromIso(iso: string | null | undefined): PhoneCountryCode | null {
  const code = (iso ?? '').trim().toUpperCase()
  if (!code) {
    return null
  }
  return PHONE_COUNTRY_CODES.find((c) => c.code === code) ?? null
}

/**
 * Parses stored dial string + optional ISO into country + local digits.
 * @param raw - Dial string.
 * @param iso - Companion ISO country.
 * @returns Country and local digits.
 */
function parseValue(
  raw: string | null | undefined,
  iso?: string | null,
): { country: PhoneCountryCode | null; local: string } {
  const trimmed = (raw ?? '').trim()
  const parts = trimmed ? parsePhoneParts(trimmed) : { countryCode: '', localNumber: '' }
  const fromIso = countryFromIso(iso)
  if (fromIso) {
    return { country: fromIso, local: parts.localNumber }
  }
  if (!trimmed) {
    return { country: null, local: '' }
  }
  return {
    country: countryFromDialCode(parts.countryCode),
    local: parts.localNumber,
  }
}

/**
 * Profile phone control: dial-code picker + local digits; ISO is derived from selection.
 * @param props - Value, ISO, change handler, and disabled/readOnly flags.
 * @returns Phone input UI.
 */
export function PhoneInput({
  value,
  countryCode,
  onChange,
  disabled = false,
  readOnly = false,
  id = 'profile-phone',
}: PhoneInputProps): ReactNode {
  const { t } = useTranslation()
  const initial = parseValue(value, countryCode)
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountryCode | null>(initial.country)
  const [localNumber, setLocalNumber] = useState(initial.local)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const localRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  const skipEmit = useRef(true)
  const selectedRef = useRef(selectedCountry)
  const localRefState = useRef(localNumber)
  const menuPresence = useDialogPresence(menuOpen, 180)

  onChangeRef.current = onChange
  selectedRef.current = selectedCountry
  localRefState.current = localNumber

  useEffect(() => {
    const parsed = parseValue(value, countryCode)
    const nextCode = parsed.country?.code ?? null
    const currentCode = selectedRef.current?.code ?? null
    if (nextCode === currentCode && parsed.local === localRefState.current) {
      return
    }
    skipEmit.current = true
    setSelectedCountry(parsed.country)
    setLocalNumber(parsed.local)
  }, [value, countryCode])

  useEffect(() => {
    if (skipEmit.current) {
      skipEmit.current = false
      return
    }
    const dialCode = selectedCountry?.dialCode ?? ''
    const combined = combinePhoneParts(dialCode, localNumber)
    const iso = selectedCountry?.code ?? ''
    if (combined !== value || iso !== (countryCode ?? '').trim().toUpperCase()) {
      onChangeRef.current(combined, iso)
    }
  }, [selectedCountry, localNumber, value, countryCode])

  useEffect(() => {
    if (!menuOpen) {
      setSearchQuery('')
      return
    }
    searchRef.current?.focus()
    /**
     * Closes the dial picker on outside pointer press.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    /**
     * Closes the dial picker on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const filteredCountries = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) {
      return PHONE_COUNTRY_CODES
    }
    const lower = query.toLowerCase()
    const upper = query.toUpperCase()
    return PHONE_COUNTRY_CODES.filter((country) => {
      const nameMatch = country.name.toLowerCase().includes(lower)
      const dialMatch =
        country.dialCode.includes(query) || country.dialCode.replace('+', '').includes(query)
      const isoMatch =
        country.code.toLowerCase() === lower ||
        country.code.toUpperCase() === upper ||
        country.code.toLowerCase().includes(lower)
      return nameMatch || dialMatch || isoMatch
    })
  }, [searchQuery])

  const numberPlaceholder =
    selectedCountry?.placeholder ?? t('common.phoneInput.local')

  if (readOnly || disabled) {
    const display = value.trim() || '—'
    return (
      <p
        id={id}
        className="w-full cursor-default rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand dark:border-white/10 dark:bg-zinc-950/40"
      >
        {display}
      </p>
    )
  }

  return (
    <div className="relative flex" ref={rootRef}>
      <div className="relative shrink-0">
        <button
          type="button"
          className="inline-flex h-11 min-w-[5.5rem] items-center gap-1.5 rounded-l-2xl border border-r-0 border-zinc-950/10 bg-white/60 px-3 text-sm font-medium text-brand outline-none transition hover:bg-zinc-950/5 focus:border-brand dark:border-white/10 dark:bg-zinc-950/40 dark:hover:bg-white/10"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {selectedCountry ? (
            <>
              <PhoneFlagIcon code={selectedCountry.code} />
              <span className="tabular-nums">{selectedCountry.dialCode}</span>
            </>
          ) : (
            <span className="text-muted">{t('common.phoneInput.pickCountry')}</span>
          )}
          <ChevronDownIcon
            className={`size-3.5 shrink-0 text-muted transition ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {menuPresence.mounted ? (
          <div
            className={`absolute top-full left-0 z-50 mt-1 flex max-h-80 w-72 flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white/95 shadow-xl dark:border-white/10 dark:bg-zinc-950/95 ${
              menuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
            }`}
            role="listbox"
          >
            <div className="sticky top-0 border-b border-zinc-950/10 bg-white/95 p-2 dark:border-white/10 dark:bg-zinc-950/95">
              <input
                ref={searchRef}
                type="text"
                className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm text-brand outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-950/40"
                placeholder={t('common.phoneInput.search')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredCountries.length > 0 ? (
                filteredCountries.map((country) => {
                  const selected = selectedCountry?.code === country.code
                  return (
                    <button
                      key={country.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        selected
                          ? 'bg-brand/15 font-semibold text-brand'
                          : 'text-brand hover:bg-zinc-950/5 dark:hover:bg-white/10'
                      }`}
                      onClick={() => {
                        setSelectedCountry(country)
                        setMenuOpen(false)
                        localRef.current?.focus()
                      }}
                    >
                      <PhoneFlagIcon code={country.code} />
                      <span className="min-w-0 flex-1 truncate font-medium">{country.name}</span>
                      <span className="tabular-nums text-muted">{country.dialCode}</span>
                    </button>
                  )
                })
              ) : (
                <p className="px-3 py-4 text-center text-sm text-muted">
                  {t('common.phoneInput.noCountries')}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <input
        id={id}
        ref={localRef}
        type="tel"
        autoComplete="tel-national"
        className="h-11 min-w-0 flex-1 rounded-r-2xl border border-zinc-950/10 bg-white/60 px-4 text-sm text-brand outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-950/40"
        value={localNumber}
        placeholder={numberPlaceholder}
        onChange={(event) => setLocalNumber(event.target.value.replace(/\D/g, ''))}
      />
    </div>
  )
}
