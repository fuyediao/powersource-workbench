/**
 * Country flag from English CRM labels via ISO alpha-2.
 * SVGs come from `src/icons/flags.ts` as cached data URIs (not `public/flags`).
 * Uses `<img>` so list rows do not parse multi-KB SVG into the DOM on every paint.
 * Aspect ratio matches flag-icons viewBox (640×480 → 4:3).
 */

import { memo, type ReactNode } from 'react'
import { getFlagSvgDataUri } from '@/icons/flags'
import { getAlpha2ForCountryName } from '@/utils/map/country-alpha2'

/** Flag SVG viewBox width / height (640 / 480). */
const FLAG_ASPECT = 4 / 3

interface CountryFlagProps {
  /** Country label matching COUNTRY_OPTIONS / DB (English). */
  countryName: string | null | undefined
  /** Flag height in pixels (width is derived at 4:3). */
  size?: number
  className?: string
}

/**
 * Renders a country flag as a 4:3 image from the bundled flag map.
 * @param props - Country label and optional height.
 * @returns Flag image, or a dash placeholder when unresolved / missing.
 */
export const CountryFlag = memo(function CountryFlag({
  countryName,
  size = 18,
  className = '',
}: CountryFlagProps): ReactNode {
  const alpha2 = getAlpha2ForCountryName(countryName)
  const src = alpha2 ? getFlagSvgDataUri(alpha2) : undefined
  const height = size
  const width = Math.round(size * FLAG_ASPECT)

  if (!src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[2px] text-[10px] text-muted ${className}`.trim()}
        style={{ width, height, minWidth: width }}
        aria-hidden
      >
        —
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block shrink-0 overflow-hidden rounded-[2px] object-fill ${className}`.trim()}
      style={{ width, height, minWidth: width }}
      aria-hidden
    />
  )
})
