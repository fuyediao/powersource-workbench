/**
 * Maps customer channel platform keys to brand icon components.
 */

import type { ComponentType, ReactElement, SVGProps } from 'react'
import {
  DiscordIcon,
  ExternalLinkIcon,
  FacebookIcon,
  InstagramIcon,
  LineBrandIcon,
  LinkedinIcon,
  RedditIcon,
  TiktokIcon,
  TwitterXIcon,
  YoutubeIcon,
} from '@/icons/AllIcons'

type IconProps = SVGProps<SVGSVGElement>

/** Quick-link order matching web CustomerDetailView. */
export const QUICK_SOCIAL_PLATFORM_ORDER = [
  'youtube',
  'instagram',
  'facebook',
  'discord',
  'twitter-x',
  'linkedin',
] as const

export type QuickSocialPlatform = (typeof QUICK_SOCIAL_PLATFORM_ORDER)[number]

const PLATFORM_ICONS: Record<string, ComponentType<IconProps>> = {
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  discord: DiscordIcon,
  tiktok: TiktokIcon,
  linkedin: LinkedinIcon,
  'twitter-x': TwitterXIcon,
  twitter: TwitterXIcon,
  x: TwitterXIcon,
  threads: InstagramIcon,
  line: LineBrandIcon,
  reddit: RedditIcon,
}

/**
 * Resolves a channel platform brand icon (falls back to external-link).
 * @param platformKey - Stored platform key.
 * @returns Icon component.
 */
export function getChannelPlatformIcon(
  platformKey: string,
): ComponentType<IconProps> {
  const normalized =
    platformKey === 'twitter' || platformKey === 'x' ? 'twitter-x' : platformKey
  return PLATFORM_ICONS[normalized] ?? ExternalLinkIcon
}

/**
 * Renders the brand (or fallback) icon for a channel platform.
 * @param props - Platform key and SVG props.
 * @returns Icon element.
 */
export function ChannelPlatformIcon({
  platformKey,
  className,
  ...rest
}: IconProps & { platformKey: string }): ReactElement {
  const Icon = getChannelPlatformIcon(platformKey)
  return <Icon className={className} {...rest} />
}

/**
 * Ensures an external URL has a protocol for anchor href.
 * @param raw - User-provided URL.
 * @returns Absolute URL or empty string.
 */
export function normalizeChannelExternalUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}
