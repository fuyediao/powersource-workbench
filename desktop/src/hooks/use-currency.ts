import { useEffect, useState } from 'react'
import {
  fetchCurrencyConvert,
  normalizeCurrencyCode,
  type CurrencyCode,
  type CurrencyConvertDto,
} from '@/utils/shared/api'
import {
  fetchCurrencyPairSettings,
  saveCurrencyPairSettings,
} from '@/utils/home/library-api'

const FROM_KEY = 'atlas-currency-from'
const TO_KEY = 'atlas-currency-to'
const AMOUNT_KEY = 'atlas-currency-amount'
const REFRESH_MS = 10 * 60_000
const DEFAULT_FROM: CurrencyCode = 'USD'
const DEFAULT_TO: CurrencyCode = 'USD'
const RESET_CODE: CurrencyCode = 'USD'

/**
 * Reads a stored currency code, falling back when missing or invalid.
 * @param key - localStorage key.
 * @param fallback - Default code.
 * @returns Currency code.
 */
function readCurrency(key: string, fallback: CurrencyCode): CurrencyCode {
  try {
    const raw = window.localStorage.getItem(key)
    const normalized = raw ? normalizeCurrencyCode(raw) : null
    if (normalized) {
      return normalized
    }
  } catch {
    // Ignore storage failures.
  }
  return fallback
}

/**
 * Reads a stored amount string as a positive number.
 * @param key - localStorage key.
 * @param fallback - Default amount.
 * @returns Amount.
 */
function readAmount(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const value = Number(raw)
      if (Number.isFinite(value) && value > 0) {
        return value
      }
    }
  } catch {
    // Ignore storage failures.
  }
  return fallback
}

/**
 * Writes a currency code to localStorage (write-through cache).
 * @param key - Storage key.
 * @param code - Currency code.
 * @returns Nothing.
 */
function writeLocalCurrency(key: string, code: CurrencyCode): void {
  try {
    window.localStorage.setItem(key, code)
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Manages currency converter inputs; pair persists to Supabase when signed in.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Converter state and setters.
 */
export function useCurrency(userId: string | null): {
  amount: number
  from: CurrencyCode
  to: CurrencyCode
  conversion: CurrencyConvertDto | null
  loading: boolean
  setAmount: (amount: number) => void
  setFrom: (code: CurrencyCode) => void
  setTo: (code: CurrencyCode) => void
  swap: () => void
  resetPair: () => void
} {
  const [amount, setAmountState] = useState(() => readAmount(AMOUNT_KEY, 100))
  const [from, setFromState] = useState<CurrencyCode>(() =>
    readCurrency(FROM_KEY, DEFAULT_FROM),
  )
  const [to, setToState] = useState<CurrencyCode>(() => readCurrency(TO_KEY, DEFAULT_TO))
  const [conversion, setConversion] = useState<CurrencyConvertDto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      return
    }

    let active = true
    const currentUserId = userId

    /**
     * Loads the currency pair from the local library and syncs localStorage.
     * @returns Nothing.
     */
    async function bootstrap(): Promise<void> {
      try {
        const remote = await fetchCurrencyPairSettings(currentUserId)
        if (!active) {
          return
        }
        const remoteFrom = normalizeCurrencyCode(remote.from) ?? DEFAULT_FROM
        const remoteTo = normalizeCurrencyCode(remote.to) ?? DEFAULT_TO
        setFromState(remoteFrom)
        setToState(remoteTo)
        writeLocalCurrency(FROM_KEY, remoteFrom)
        writeLocalCurrency(TO_KEY, remoteTo)
      } catch {
        // Keep local pair on failure.
      }
    }

    void bootstrap()
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    let active = true
    setLoading(true)

    /**
     * Fetches the latest conversion for the current inputs.
     * @returns Nothing.
     */
    function refresh(): void {
      void fetchCurrencyConvert(amount, from, to)
        .then((next) => {
          if (active) {
            setConversion(next)
          }
        })
        .catch(() => {
          if (active) {
            setConversion(null)
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false)
          }
        })
    }

    refresh()
    const intervalId = window.setInterval(refresh, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [amount, from, to])

  /**
   * Persists a pair locally and to Supabase when signed in.
   * @param nextFrom - Source code.
   * @param nextTo - Target code.
   * @returns Nothing.
   */
  function persistPair(nextFrom: CurrencyCode, nextTo: CurrencyCode): void {
    writeLocalCurrency(FROM_KEY, nextFrom)
    writeLocalCurrency(TO_KEY, nextTo)
    if (!userId) {
      return
    }
    void saveCurrencyPairSettings(userId, { from: nextFrom, to: nextTo }).catch(
      () => undefined,
    )
  }

  /**
   * Updates the source amount and persists it locally.
   * @param next - Next amount.
   * @returns Nothing.
   */
  function setAmount(next: number): void {
    const safe = Number.isFinite(next) && next >= 0 ? next : 0
    setAmountState(safe)
    try {
      if (safe > 0) {
        window.localStorage.setItem(AMOUNT_KEY, String(safe))
      } else {
        window.localStorage.removeItem(AMOUNT_KEY)
      }
    } catch {
      // Ignore storage failures.
    }
  }

  /**
   * Updates the source currency and persists it.
   * @param code - Currency code.
   * @returns Nothing.
   */
  function setFrom(code: CurrencyCode): void {
    const normalized = normalizeCurrencyCode(code)
    if (!normalized) {
      return
    }
    setFromState(normalized)
    persistPair(normalized, to)
  }

  /**
   * Updates the target currency and persists it.
   * @param code - Currency code.
   * @returns Nothing.
   */
  function setTo(code: CurrencyCode): void {
    const normalized = normalizeCurrencyCode(code)
    if (!normalized) {
      return
    }
    setToState(normalized)
    persistPair(from, normalized)
  }

  /**
   * Swaps source and target currencies.
   * @returns Nothing.
   */
  function swap(): void {
    setFromState(to)
    setToState(from)
    persistPair(to, from)
  }

  /**
   * Resets both sides to USD and persists.
   * @returns Nothing.
   */
  function resetPair(): void {
    setFromState(RESET_CODE)
    setToState(RESET_CODE)
    persistPair(RESET_CODE, RESET_CODE)
  }

  return {
    amount,
    from,
    to,
    conversion,
    loading,
    setAmount,
    setFrom,
    setTo,
    swap,
    resetPair,
  }
}
