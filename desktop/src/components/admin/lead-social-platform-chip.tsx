/**
 * Circular brand chip for the lead social-platform picker (web select parity).
 */

import { type CSSProperties, type ReactElement, type SVGProps } from 'react'
import {
  LEAD_SOCIAL_PLATFORM_OTHER_ID,
  getLeadSocialPlatformDef,
} from '@/constants/lead-social-platforms'
import {
  AlitmIcon,
  AngellistIcon,
  CrunchbaseIcon,
  DiscordIcon,
  EtsyIcon,
  FacebookIcon,
  InstagramIcon,
  KakaoTalkIcon,
  LineBrandIcon,
  LinkedinIcon,
  Link2Icon,
  MessengerIcon,
  PinterestIcon,
  QqIcon,
  RedditIcon,
  ShopeeIcon,
  SkypeIcon,
  TelegramIcon,
  TiktokIcon,
  TwitterXIcon,
  ViberIcon,
  VkIcon,
  WechatIcon,
  WecomIcon,
  WhatsappIcon,
  XiaohongshuIcon,
  YoutubeIcon,
  ZaloIcon,
} from '@/icons/AllIcons'

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement

const TRIGGER_CHIP_SHELL =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full p-0.5'

const LIST_CHIP_SHELL =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full p-1'

const TRIGGER_ICON_PX = 14
const LIST_ICON_PX = 15

const LEAD_SOCIAL_ICON_BY_NAME: Record<string, IconComponent> = {
  alitm: AlitmIcon,
  angellist: AngellistIcon,
  crunchbase: CrunchbaseIcon,
  discord: DiscordIcon,
  etsy: EtsyIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  kakaotalk: KakaoTalkIcon,
  line: LineBrandIcon,
  linkedin: LinkedinIcon,
  'link-2': Link2Icon,
  messenger: MessengerIcon,
  pinterest: PinterestIcon,
  qq: QqIcon,
  reddit: RedditIcon,
  shopee: ShopeeIcon,
  skype: SkypeIcon,
  telegram: TelegramIcon,
  tiktok: TiktokIcon,
  'twitter-x': TwitterXIcon,
  viber: ViberIcon,
  vk: VkIcon,
  wechat: WechatIcon,
  wecom: WecomIcon,
  whatsapp: WhatsappIcon,
  xiaohongshu: XiaohongshuIcon,
  youtube: YoutubeIcon,
  zalo: ZaloIcon,
}

export type LeadSocialPlatformChipSize = 'trigger' | 'list'

interface LeadSocialPlatformChipProps {
  /** Stored platform slug (empty = no chip). */
  platformId: string
  /** Closed trigger uses a smaller circle than dropdown rows. */
  size: LeadSocialPlatformChipSize
}

/**
 * Inner SVG scale inside the clipped chip (web `iconInnerStyle` parity).
 * @param scale - Optional `iconInnerScale` from the platform def.
 * @returns Inline style or undefined.
 */
function iconInnerStyle(scale: number | undefined): CSSProperties | undefined {
  if (scale == null || scale <= 1) {
    return undefined
  }
  return { transform: `scale(${scale})` }
}

/**
 * Brand chip for a social-platform option.
 * @param props - Platform slug and chip size.
 * @returns Circular chip, or null when the slug is empty.
 */
export function LeadSocialPlatformChip({
  platformId,
  size,
}: LeadSocialPlatformChipProps): ReactElement | null {
  const trimmed = platformId.trim()
  if (!trimmed) {
    return null
  }
  const def =
    getLeadSocialPlatformDef(trimmed) ?? getLeadSocialPlatformDef(LEAD_SOCIAL_PLATFORM_OTHER_ID)
  if (!def) {
    return null
  }
  const Icon = LEAD_SOCIAL_ICON_BY_NAME[def.icon]
  if (!Icon) {
    return null
  }
  const isTrigger = size === 'trigger'
  const px = isTrigger ? TRIGGER_ICON_PX : LIST_ICON_PX
  return (
    <span className={`${isTrigger ? TRIGGER_CHIP_SHELL : LIST_CHIP_SHELL} ${def.chipClass}`}>
      <span
        className="flex size-full origin-center items-center justify-center"
        style={iconInnerStyle(def.iconInnerScale)}
      >
        <Icon className="shrink-0" width={px} height={px} />
      </span>
    </span>
  )
}
