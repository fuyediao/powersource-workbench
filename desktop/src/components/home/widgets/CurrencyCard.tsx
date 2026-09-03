import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CurrencyIcon, SwapIcon } from '@/icons/AllIcons'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import { useAnimatedHeight } from '@/hooks/use-animated-height'
import { useWidgetTools } from '@/hooks/use-widget-tools'
import { isFiatCurrencyCode, type CurrencyCode } from '@/utils/shared/api'

type PairPhase = 'idle' | 'exit' | 'enter'

/** Shared amount row surface — locked box so input UA styles cannot diverge. */
const AMOUNT_FIELD_SHELL =
  `${FOCUS_RING_SHELL} flex h-10 min-h-10 max-h-10 items-center overflow-hidden px-3` as const

/** Shared value chrome — identical on editable and read-only rows. */
const AMOUNT_VALUE_CLASS =
  'h-full w-full min-h-0 appearance-none border-0 bg-transparent p-0 text-sm font-semibold leading-none tabular-nums text-brand outline-none' as const

/** Allows empty, integers, and partial decimals while typing (e.g. `88.`). */
const AMOUNT_DRAFT_PATTERN = /^\d*\.?\d*$/

/**
 * Formats a conversion amount for display.
 * @param value - Numeric amount.
 * @param code - Currency code for fraction digits.
 * @returns Localized amount string.
 */
function formatAmount(value: number, code: CurrencyCode): string {
  const upper = code.toUpperCase()
  if (upper === 'JPY' || upper === 'KRW') {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }
  if (!isFiatCurrencyCode(upper)) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8,
    }).format(value)
  }
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Renders a currency converter widget.
 * @returns Currency converter widget.
 */
export function CurrencyCard() {
  const { t } = useTranslation()
  const {
    amount,
    from,
    to,
    conversion,
    currencyLoading,
    setAmount,
    swapCurrencies,
  } = useWidgetTools()
  const [pairPhase, setPairPhase] = useState<PairPhase>('idle')
  const [iconTurns, setIconTurns] = useState(0)
  const [amountDraft, setAmountDraft] = useState(() =>
    Number.isFinite(amount) ? String(amount) : '0',
  )
  const amountFocusedRef = useRef(false)
  const swapTimerRef = useRef<number | null>(null)
  const { shellRef, contentRef } = useAnimatedHeight([
    amount,
    from,
    to,
    conversion?.result,
    currencyLoading,
  ])

  useEffect(() => {
    return () => {
      if (swapTimerRef.current !== null) {
        window.clearTimeout(swapTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (amountFocusedRef.current) {
      return
    }
    setAmountDraft(Number.isFinite(amount) ? String(amount) : '0')
  }, [amount])

  /**
   * Swaps currencies with a vertical pair transition and icon spin.
   * @returns Nothing.
   */
  function handleSwap(): void {
    if (pairPhase !== 'idle') {
      return
    }
    if (swapTimerRef.current !== null) {
      window.clearTimeout(swapTimerRef.current)
    }
    setPairPhase('exit')
    setIconTurns((turns) => turns + 1)
    swapTimerRef.current = window.setTimeout(() => {
      swapCurrencies()
      setPairPhase('enter')
      swapTimerRef.current = window.setTimeout(() => {
        setPairPhase('idle')
        swapTimerRef.current = null
      }, 220)
    }, 160)
  }

  /**
   * Keeps a string draft so trailing decimals stay visible while typing.
   * @param raw - Raw input value.
   * @returns Nothing.
   */
  function handleAmountChange(raw: string): void {
    if (!AMOUNT_DRAFT_PATTERN.test(raw)) {
      return
    }
    setAmountDraft(raw)
    if (raw === '' || raw === '.') {
      setAmount(0)
      return
    }
    const next = Number(raw)
    if (Number.isFinite(next) && next >= 0) {
      setAmount(next)
    }
  }

  /**
   * Commits the draft to a finite amount when the field blurs.
   * @returns Nothing.
   */
  function handleAmountBlur(): void {
    amountFocusedRef.current = false
    const next = Number(amountDraft)
    const safe = Number.isFinite(next) && next >= 0 ? next : 0
    setAmount(safe)
    setAmountDraft(String(safe))
  }

  const fromClass =
    pairPhase === 'exit'
      ? 'currency-pair-from-exit'
      : pairPhase === 'enter'
        ? 'currency-pair-from-enter'
        : ''
  const toClass =
    pairPhase === 'exit'
      ? 'currency-pair-to-exit'
      : pairPhase === 'enter'
        ? 'currency-pair-to-enter'
        : ''

  return (
    <section
      ref={shellRef}
      className="glass-panel overflow-hidden rounded-3xl will-change-[height]"
    >
      <div ref={contentRef} className="p-5">
        <header className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-brand">{t('currency.title')}</h2>
            <button
              type="button"
              className="mt-1 text-muted transition hover:text-brand disabled:opacity-60"
              disabled={pairPhase !== 'idle'}
              onClick={handleSwap}
            >
              <span className="flex h-4 items-center gap-1 overflow-hidden text-xs font-semibold tabular-nums">
                <span className={`inline-block ${fromClass}`}>{from}</span>
                <SwapIcon
                  className="size-3.5 shrink-0 text-brand transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ transform: `rotate(${iconTurns * 180}deg)` }}
                />
                <span className={`inline-block ${toClass}`}>{to}</span>
              </span>
            </button>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <CurrencyIcon className="size-5" />
          </span>
        </header>

        <div className="space-y-2">
          <FocusRingFrame shellClassName={AMOUNT_FIELD_SHELL}>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amountDraft}
              onFocus={() => {
                amountFocusedRef.current = true
              }}
              onBlur={handleAmountBlur}
              onChange={(event) => handleAmountChange(event.target.value)}
              className={AMOUNT_VALUE_CLASS}
            />
          </FocusRingFrame>

          <div className="relative p-0.5">
            <div
              className={`${AMOUNT_FIELD_SHELL} ${
                currencyLoading && !conversion ? 'opacity-60' : ''
              }`}
            >
              <input
                type="text"
                readOnly
                tabIndex={-1}
                value={
                  conversion
                    ? formatAmount(conversion.result, to)
                    : currencyLoading
                      ? t('status.loading')
                      : '—'
                }
                className={`${AMOUNT_VALUE_CLASS} cursor-default truncate`}
              />
            </div>
          </div>

          {!conversion && !currencyLoading ? (
            <p className="text-xs text-muted">{t('currency.unavailable')}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
