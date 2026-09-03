/**
 * Preset social / IM platforms for **`extended_fields.socialAccounts[].platform`** (slug).
 * Legacy single-field **`socialPlatform`** is still read for migration.
 * Rows are mostly **A–Z by `id`**; **alitm**, **xiaohongshu**, and **other** are listed **last** (product order).
 */
export interface LeadSocialPlatformDef {
  /** Stored slug in **`extended_fields.socialAccounts[].platform`** (or legacy **`socialPlatform`**) */
  id: string
  /** `AllIcons` name */
  icon: string
  /** Tailwind classes for the circular chip behind the glyph */
  chipClass: string
  /**
   * CSS `transform: scale(...)` applied inside the fixed chip so fine detail stays readable
   * without enlarging the outer circle (only applied when greater than 1).
   */
  iconInnerScale?: number
}

/**
 * Sentinel stored in **`platform`** when the user picks `other`; free label goes in **`custom`** (legacy: **`socialPlatformCustom`**).
 */
export const LEAD_SOCIAL_PLATFORM_OTHER_ID = 'other' as const

/**
 * Extra tokens for the lead social-platform picker search. UI labels stay **WeChat** / **WeCom** in all locales,
 * so zh-CN / zh-TW names (and pinyin) are matched here via a lowercased **`includes`** haystack.
 */
export const LEAD_SOCIAL_PLATFORM_SEARCH_EXTRA: Readonly<Record<string, readonly string[]>> = {
  wechat: ['微信', 'wechat', 'weixin'],
  wecom: ['企業微信', '企业微信', '企微', 'wecom'],
}

export const LEAD_SOCIAL_PLATFORMS: readonly LeadSocialPlatformDef[] = [
  { id: 'angellist', icon: 'angellist', chipClass: 'bg-white ring-1 ring-gray-800/25' },
  { id: 'crunchbase', icon: 'crunchbase', chipClass: 'bg-[#0288D1] text-white' },
  { id: 'discord', icon: 'discord', chipClass: 'bg-[#5865F2] text-white', iconInnerScale: 1.15 },
  { id: 'etsy', icon: 'etsy', chipClass: 'bg-[#FFFFFF] text-white', iconInnerScale: 1.5 },
  { id: 'facebook', icon: 'facebook', chipClass: 'bg-[#1877F2] text-white' },
  { id: 'instagram', icon: 'instagram', chipClass: 'bg-linear-to-br from-[#f58529] via-[#dd2a7b] to-[#8134AF] text-white' },
  { id: 'kakaotalk', icon: 'kakaotalk', chipClass: 'bg-[#FAE100] text-[#3C1E1E]', iconInnerScale: 1.2 },
  { id: 'line', icon: 'line', chipClass: 'bg-[#00B900] text-white' },
  { id: 'linkedin', icon: 'linkedin', chipClass: 'bg-[#0A66C2] text-white' },
  { id: 'messenger', icon: 'messenger', chipClass: 'bg-linear-to-br from-[#00B2FF] to-[#FF3CAC] text-white' },
  { id: 'pinterest', icon: 'pinterest', chipClass: 'bg-[#E60023] text-white' },
  { id: 'qq', icon: 'qq', chipClass: 'bg-white ring-1 ring-gray-800/25', iconInnerScale: 1.4 },
  { id: 'reddit', icon: 'reddit', chipClass: 'bg-[#FF4500] text-white', iconInnerScale: 1.3 },
  { id: 'shopee', icon: 'shopee', chipClass: 'bg-[#EE4D2D] text-white' },
  { id: 'skype', icon: 'skype', chipClass: 'bg-[#00AFF0] text-white', iconInnerScale: 1.3 },
  { id: 'telegram', icon: 'telegram', chipClass: 'bg-[#26A5E4] text-white' },
  { id: 'tiktok', icon: 'tiktok', chipClass: 'bg-black text-white', iconInnerScale: 1.2 },
  { id: 'twitter', icon: 'twitter-x', chipClass: 'bg-black text-white' },
  { id: 'viber', icon: 'viber', chipClass: 'bg-white text-[#7360F2] ring-1 ring-gray-800/25', iconInnerScale: 1.08 },
  { id: 'vk', icon: 'vk', chipClass: 'bg-[#0077FF] text-white', iconInnerScale: 1.4 },
  { id: 'wechat', icon: 'wechat', chipClass: 'bg-[#2DC100] text-white', iconInnerScale: 1.25 },
  { id: 'wecom', icon: 'wecom', chipClass: 'bg-white ring-1 ring-gray-800/25', iconInnerScale: 1.4 },
  { id: 'whatsapp', icon: 'whatsapp', chipClass: 'bg-[#25D366] text-white' },
  { id: 'youtube', icon: 'youtube', chipClass: 'bg-[#FF0000] text-white' },
  { id: 'zalo', icon: 'zalo', chipClass: 'bg-[#0068FF] text-white' },
  { id: 'alitm', icon: 'alitm', chipClass: 'bg-[#40A9FF] text-white', iconInnerScale: 2 },
  { id: 'xiaohongshu', icon: 'xiaohongshu', chipClass: 'bg-[#FF2442] text-white', iconInnerScale: 1.3 },
  { id: 'other', icon: 'link-2', chipClass: 'bg-gray-600/90 text-white' },
] as const

const PLATFORM_IDS = new Set(LEAD_SOCIAL_PLATFORMS.map((p) => p.id))

/**
 * @param value - Stored extended field value
 * @returns Whether the value matches a known preset slug
 */
export function isKnownLeadSocialPlatform(value: string): boolean {
  return PLATFORM_IDS.has(value.trim())
}

/**
 * @param id - Platform slug
 * @returns Preset definition or undefined
 */
export function getLeadSocialPlatformDef(id: string): LeadSocialPlatformDef | undefined {
  return LEAD_SOCIAL_PLATFORMS.find((p) => p.id === id)
}
