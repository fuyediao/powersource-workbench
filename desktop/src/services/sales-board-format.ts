/**
 * Currency formatting helpers for the Sales Board.
 */

/**
 * Formats an amount as a compact currency string (US$2.83M / $395).
 * @param amount - Numeric amount.
 * @param currency - ISO currency code.
 * @returns Display string.
 */
export function compactMoney(amount: number, currency = 'USD'): string {
  const symbol = currencySymbol(currency)
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `${symbol}${(amount / 1_000).toFixed(0)}K`
  }
  return formatMoney(amount, currency, 0)
}

/**
 * Formats an amount with grouping separators.
 * @param amount - Numeric amount.
 * @param currency - ISO currency code.
 * @param fractionDigits - Fraction digits (default 0).
 * @returns Display string.
 */
export function formatMoney(amount: number, currency = 'USD', fractionDigits = 0): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(amount)
  } catch {
    return `${currencySymbol(currency)}${amount.toFixed(fractionDigits)}`
  }
}

/**
 * @param currency - ISO currency code.
 * @returns A short prefix used by compact formatting.
 */
function currencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase()
  if (code === 'USD' || code === '') {
    return 'US$'
  }
  return `${code} `
}
