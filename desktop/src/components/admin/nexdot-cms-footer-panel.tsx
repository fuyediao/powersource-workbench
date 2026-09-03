/**
 * NEXDOT CMS footer contact + social links panel.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ChevronDownIcon, ChevronUpIcon } from '@/icons/AllIcons'
import {
  emptyShopFooterSettings,
  fetchShopFooterSettings,
  normalizeFooterSocialOrder,
  upsertShopFooterSettings,
  type ShopFooterSettings,
  type ShopFooterSocialChannel,
} from '@/services/shop-home-repository'

interface NexdotCmsFooterPanelProps {
  writes: AdminShellWrites | null
}

const CHANNEL_LABEL_KEY: Record<ShopFooterSocialChannel, string> = {
  instagram: 'admin.obm.footerInstagram',
  facebook: 'admin.obm.footerFacebook',
  youtube: 'admin.obm.footerYoutube',
  tiktok: 'admin.obm.footerTiktok',
  linkedin: 'admin.obm.footerLinkedin',
  twitter: 'admin.obm.footerTwitter',
  website: 'admin.obm.footerWebsite',
}

/**
 * Footer CMS: contact fields and social channel order/URLs.
 * @param props - Write grants.
 * @returns Footer panel UI.
 */
export function NexdotCmsFooterPanel({
  writes,
}: NexdotCmsFooterPanelProps): ReactNode {
  const { t } = useTranslation()
  const canEdit = Boolean(writes?.canEdit || writes?.canCreate)
  const [settings, setSettings] = useState<ShopFooterSettings>(emptyShopFooterSettings)
  const [draft, setDraft] = useState<ShopFooterSettings>(emptyShopFooterSettings)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchShopFooterSettings()
      setSettings(next)
      setDraft(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Persists contact draft.
   * @returns void
   */
  async function saveContact(): Promise<void> {
    if (!canEdit || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved = await upsertShopFooterSettings(draft)
      setSettings(saved)
      setDraft(saved)
      setEditing(false)
      setMessage(t('admin.obm.footerSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Saves social URL / enabled / order immediately.
   * @param next - Updated settings.
   */
  async function saveSocial(next: ShopFooterSettings): Promise<void> {
    if (!canEdit || saving) return
    setSaving(true)
    setError(null)
    try {
      const saved = await upsertShopFooterSettings(next)
      setSettings(saved)
      if (!editing) setDraft(saved)
      else setDraft((prev) => ({ ...prev, ...pickSocial(saved) }))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm font-medium text-ink">{t('admin.obm.loading')}</p>
  }

  const order = normalizeFooterSocialOrder(settings.socialOrder)

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-ink">{t('admin.obm.sectionFooter')}</h3>
            <p className="text-xs text-muted">{t('admin.obm.sectionFooterHint')}</p>
          </div>
          {canEdit ? (
            editing ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"
                  onClick={() => {
                    setDraft(settings)
                    setEditing(false)
                  }}
                >
                  {t('admin.obm.cancel')}
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                  disabled={saving}
                  onClick={() => void saveContact()}
                >
                  {saving ? t('admin.obm.footerSaving') : t('admin.obm.footerSave')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"
                onClick={() => setEditing(true)}
              >
                {t('admin.obm.footerEdit')}
              </button>
            )
          ) : null}
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {(
            [
              ['address', 'admin.obm.footerAddress'],
              ['email', 'admin.obm.footerEmail'],
              ['phone', 'admin.obm.footerPhone'],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key} className="block text-xs font-semibold text-muted">
              {t(labelKey)}
              {editing ? (
                <input
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm font-medium text-ink dark:bg-zinc-900"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              ) : (
                <p className="mt-1 text-sm font-medium text-ink">
                  {settings[key] || t('admin.obm.footerEmpty')}
                </p>
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="border-b border-ink/10 px-4 py-3">
          <h3 className="text-sm font-bold text-ink">{t('admin.obm.footerSocialTitle')}</h3>
          <p className="text-xs text-muted">{t('admin.obm.footerSocialHint')}</p>
        </div>
        <ul className="divide-y divide-ink/10">
          {order.map((channel, index) => {
            const urlKey = `${channel}Url` as keyof ShopFooterSettings
            const enabledKey = `${channel}Enabled` as keyof ShopFooterSettings
            const url = String(settings[urlKey] ?? '')
            const enabled = Boolean(settings[enabledKey])
            return (
              <li key={channel} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-28 text-xs font-bold text-ink">
                  {t(CHANNEL_LABEL_KEY[channel])}
                </span>
                <input
                  className="min-w-48 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || saving}
                  value={url}
                  onBlur={(e) => {
                    const nextUrl = e.target.value.trim()
                    if (nextUrl === url) return
                    void saveSocial({
                      ...settings,
                      [urlKey]: nextUrl,
                    } as ShopFooterSettings)
                  }}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      [urlKey]: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                  disabled={!canEdit || saving}
                  onClick={() =>
                    void saveSocial({
                      ...settings,
                      [enabledKey]: !enabled,
                    } as ShopFooterSettings)
                  }
                >
                  {enabled ? t('admin.obm.active') : t('admin.obm.inactive')}
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || saving || index === 0}
                    onClick={() => {
                      const nextOrder = order.slice()
                      ;[nextOrder[index - 1], nextOrder[index]] = [
                        nextOrder[index],
                        nextOrder[index - 1],
                      ]
                      void saveSocial({ ...settings, socialOrder: nextOrder })
                    }}
                  >
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || saving || index === order.length - 1}
                    onClick={() => {
                      const nextOrder = order.slice()
                      ;[nextOrder[index], nextOrder[index + 1]] = [
                        nextOrder[index + 1],
                        nextOrder[index],
                      ]
                      void saveSocial({ ...settings, socialOrder: nextOrder })
                    }}
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

/**
 * Picks social-related fields from footer settings.
 * @param settings - Full settings.
 * @returns Partial social fields.
 */
function pickSocial(settings: ShopFooterSettings): Partial<ShopFooterSettings> {
  return {
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    youtubeUrl: settings.youtubeUrl,
    tiktokUrl: settings.tiktokUrl,
    linkedinUrl: settings.linkedinUrl,
    twitterUrl: settings.twitterUrl,
    websiteUrl: settings.websiteUrl,
    instagramEnabled: settings.instagramEnabled,
    facebookEnabled: settings.facebookEnabled,
    youtubeEnabled: settings.youtubeEnabled,
    tiktokEnabled: settings.tiktokEnabled,
    linkedinEnabled: settings.linkedinEnabled,
    twitterEnabled: settings.twitterEnabled,
    websiteEnabled: settings.websiteEnabled,
    socialOrder: settings.socialOrder,
  }
}
