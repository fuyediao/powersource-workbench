/**
 * KOL social channels tab: list, enrich, add/edit modal, pagination.
 */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  formatCompactNumber,
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
  optionalNonNegativeInt,
} from '@/components/admin/kol-detail/detail-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import {
  isKolApifyEnrichablePlatform,
  KOL_PLATFORM_KEYS,
} from '@/constants/kol-constants'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  CloseIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
} from '@/icons/AllIcons'
import { enrichKolChannelFields } from '@/services/kol-channel-enrich'
import { isWorkbenchApiConfigured } from '@/services/kol-channel-enrichment-api'
import {
  createKolChannel,
  deleteKolChannel,
  listKolChannels,
  updateKolChannel,
} from '@/services/kols-api'
import type { KolChannel, KolChannelInput } from '@/types/kol'
import { toAbsoluteChannelPageUrl } from '@/utils/channel-page-url'
import { ChannelPlatformIcon } from '@/utils/channel-platform-icon'

const CHANNELS_PAGE_SIZE = 8

interface ChannelsPanelProps {
  mode: 'create' | 'detail'
  kolId: string | null
  groupId: string | null
  editing: boolean
  channels: KolChannel[]
  onChannelsChange: (next: KolChannel[]) => void
}

interface ChannelDraft {
  id: string | null
  platformKey: string
  platformCustomName: string
  channelUrl: string
  handle: string
  followers: string
  contentCount: string
}

/**
 * Blank channel draft for the add form.
 * @returns Empty draft.
 */
function emptyChannelDraft(): ChannelDraft {
  return {
    id: null,
    platformKey: 'youtube',
    platformCustomName: '',
    channelUrl: '',
    handle: '',
    followers: '',
    contentCount: '',
  }
}

/**
 * Display label for a channel platform (custom name for `other`).
 * @param platformKey - Platform slug.
 * @param customName - Optional custom label.
 * @param t - i18n function.
 * @returns Localized label.
 */
function displayPlatformLabel(
  platformKey: string,
  customName: string | null | undefined,
  translate: (key: string, options?: { defaultValue: string }) => string,
): string {
  if (platformKey === 'other' && customName?.trim()) {
    return customName.trim()
  }
  return translate(`admin.kol.platform.${platformKey}`, { defaultValue: platformKey })
}

/**
 * True when the row supports live stats refresh.
 * @param key - Platform key.
 * @returns Whether enrichment is available.
 */
function isEnrichable(key: string): boolean {
  return key === 'youtube' || isKolApifyEnrichablePlatform(key)
}

/**
 * Social channels list with add/edit modal and live stats refresh.
 * @param props - Mode, ids, channels, and change callback.
 * @returns Panel UI.
 */
export function ChannelsPanel({
  mode,
  kolId,
  groupId,
  editing,
  channels,
  onChannelsChange,
}: ChannelsPanelProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState<ChannelDraft | null>(null)
  const draftPresence = useDialogPresence(Boolean(draft))
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const apiReady = isWorkbenchApiConfigured()
  const hasEnrichable = channels.some((ch) => isEnrichable(ch.platformKey))
  const totalPages = Math.max(1, Math.ceil(channels.length / CHANNELS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = channels.slice(
    (safePage - 1) * CHANNELS_PAGE_SIZE,
    safePage * CHANNELS_PAGE_SIZE,
  )

  const platformOptions = useMemo<CrmFilterOption[]>(
    () =>
      KOL_PLATFORM_KEYS.map((key) => ({
        value: key,
        label: t(`admin.kol.platform.${key}`),
      })),
    [t],
  )

  /**
   * Reloads channels from the API.
   * @returns Nothing.
   */
  async function reload(): Promise<void> {
    if (!kolId) {
      return
    }
    onChannelsChange(await listKolChannels(kolId))
  }

  /**
   * Opens the add-channel modal.
   * @returns Nothing.
   */
  function openAdd(): void {
    if (mode === 'create' || !kolId) {
      return
    }
    setHeaderError(null)
    setRowErrors({})
    setModalError(null)
    setDraft(emptyChannelDraft())
  }

  /**
   * Opens the edit-channel modal for an existing row.
   * @param channel - Saved channel.
   * @returns Nothing.
   */
  function openEdit(channel: KolChannel): void {
    if (mode === 'create' || !kolId) {
      return
    }
    setHeaderError(null)
    setRowErrors({})
    setModalError(null)
    setDraft({
      id: channel.id,
      platformKey: channel.platformKey,
      platformCustomName: channel.platformCustomName ?? '',
      channelUrl: channel.channelUrl,
      handle: channel.handle ?? '',
      followers: channel.followers != null ? String(channel.followers) : '',
      contentCount: channel.contentCount != null ? String(channel.contentCount) : '',
    })
  }

  /**
   * Closes the add/edit modal.
   * @returns Nothing.
   */
  function closeModal(): void {
    setDraft(null)
    setModalError(null)
  }

  /**
   * Builds a channel payload, enriches when possible, then create/update.
   * Enrichment failure still saves with `enrichmentError` set.
   * @returns Nothing.
   */
  async function submitDraft(): Promise<void> {
    if (!draft || saving || !kolId) {
      return
    }
    if (!draft.channelUrl.trim()) {
      setModalError(t('admin.kol.error.channelUrlRequired'))
      return
    }
    if (draft.platformKey === 'other' && !draft.platformCustomName.trim()) {
      setModalError(t('admin.kolDetail.field.platformCustomName'))
      return
    }
    setSaving(true)
    setModalError(null)
    const isEdit = Boolean(draft.id)
    const platformKey = draft.platformKey
    const needsRemote = isEnrichable(platformKey)
    let input: KolChannelInput = {
      platformKey,
      platformCustomName:
        platformKey === 'other' ? draft.platformCustomName.trim() || null : null,
      channelUrl: draft.channelUrl,
      handle: needsRemote ? null : draft.handle.trim() || null,
      followers: needsRemote ? null : optionalNonNegativeInt(draft.followers),
      contentCount: needsRemote ? null : optionalNonNegativeInt(draft.contentCount),
      notes: null,
      enrichmentError: null,
    }
    const enrichResult = await enrichKolChannelFields(kolId, input)
    if (enrichResult.ok) {
      input = { ...enrichResult.enriched, enrichmentError: null }
    } else {
      input = {
        ...input,
        channelUrl: toAbsoluteChannelPageUrl(input.channelUrl),
        enrichmentError: t(enrichResult.errorKey),
      }
    }
    try {
      if (isEdit && draft.id) {
        await updateKolChannel(draft.id, input)
      } else {
        await createKolChannel(kolId, groupId, input)
      }
      closeModal()
      await reload()
    } catch (err) {
      console.error('[ChannelsPanel] save:', err)
      setModalError(
        isEdit
          ? t('admin.kolDetail.errorUpdateChannel')
          : t('admin.kolDetail.errorAddChannel'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Removes one channel row.
   * @param channelId - Channel uuid.
   * @returns Nothing.
   */
  async function removeChannel(channelId: string): Promise<void> {
    try {
      await deleteKolChannel(channelId)
      await reload()
    } catch (err) {
      console.error('[ChannelsPanel] delete:', err)
      setHeaderError(t('admin.kolDetail.errorRemoveChannel'))
    }
  }

  /**
   * Re-fetches stats for one enrichable channel.
   * @param channel - Channel row.
   * @returns Nothing.
   */
  async function refreshRow(channel: KolChannel): Promise<void> {
    if (!kolId || !isEnrichable(channel.platformKey) || !apiReady) {
      return
    }
    setRefreshingId(channel.id)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[channel.id]
      return next
    })
    const base: KolChannelInput = {
      platformKey: channel.platformKey,
      platformCustomName: channel.platformCustomName,
      channelUrl: channel.channelUrl,
      handle: channel.handle,
      followers: channel.followers,
      notes: channel.notes,
      contentCount: channel.contentCount,
    }
    const result = await enrichKolChannelFields(kolId, base)
    try {
      if (result.ok) {
        await updateKolChannel(channel.id, {
          ...result.enriched,
          enrichmentError: null,
        })
      } else {
        await updateKolChannel(channel.id, {
          ...base,
          enrichmentError: t(result.errorKey),
        })
        setRowErrors((prev) => ({
          ...prev,
          [channel.id]: t(result.errorKey),
        }))
      }
      await reload()
    } catch (err) {
      console.error('[ChannelsPanel] refresh row:', err)
      setRowErrors((prev) => ({
        ...prev,
        [channel.id]: t('admin.kolDetail.errorRefreshChannelStats'),
      }))
    } finally {
      setRefreshingId(null)
    }
  }

  /**
   * Re-fetches stats for every enrichable channel (sequential).
   * @returns Nothing.
   */
  async function refreshAll(): Promise<void> {
    if (!kolId || !hasEnrichable || editing) {
      return
    }
    setRefreshingAll(true)
    setHeaderError(null)
    try {
      for (const channel of channels.filter((ch) => isEnrichable(ch.platformKey))) {
        await refreshRow(channel)
      }
    } catch (err) {
      console.error('[ChannelsPanel] refresh all:', err)
      setHeaderError(t('admin.kolDetail.errorRefreshChannelStats'))
    } finally {
      setRefreshingAll(false)
    }
  }

  /**
   * Opens a channel profile URL via the app link handler.
   * @param raw - Stored URL.
   * @returns Nothing.
   */
  function openChannel(raw: string): void {
    const url = toAbsoluteChannelPageUrl(raw)
    if (url) {
      openUrl(url)
    }
  }

  const canSubmit =
    Boolean(draft?.channelUrl.trim()) &&
    (draft?.platformKey !== 'other' || Boolean(draft.platformCustomName.trim()))

  return (
    <div className={`${detailSectionCardClass()} overflow-hidden p-0`}>
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2">
        <div className="flex min-w-0 shrink items-center gap-1.5">
          {mode !== 'create' && kolId ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand/15 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/25"
              onClick={openAdd}
            >
              <PlusIcon className="size-3.5" />
              {t('admin.kolDetail.addChannel')}
            </button>
          ) : null}
          {mode !== 'create' && kolId && hasEnrichable && !editing ? (
            <button
              type="button"
              className="shrink-0 rounded-xl p-1.5 text-muted hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              disabled={refreshingAll || refreshingId !== null || !apiReady}
              aria-label={t('admin.kolDetail.refreshYoutubeStatsTitle')}
              title={
                !apiReady
                  ? t('admin.kolDetail.refreshYoutubeStatsDisabledWorkbench')
                  : t('admin.kolDetail.refreshYoutubeStatsTitle')
              }
              onClick={() => void refreshAll()}
            >
              <RefreshIcon
                className={`size-4 ${refreshingAll ? 'animate-spin' : ''}`}
              />
            </button>
          ) : null}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {channels.length}
        </span>
      </div>

      {headerError ? (
        <p className="border-b border-ink/10 bg-rose-500/5 px-4 py-2 text-xs text-rose-500">
          {headerError}
        </p>
      ) : null}

      {mode === 'create' ? (
        <p className="px-4 py-3 text-xs text-muted italic">
          {t('admin.kolDetail.channelsSaveFirst')}
        </p>
      ) : null}

      {mode !== 'create' && channels.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted">
          {t('admin.kolDetail.noChannelRows')}
        </p>
      ) : null}

      {mode !== 'create' && channels.length > 0 ? (
        <div className="divide-y divide-ink/10">
          {paged.map((ch) => (
            <div key={ch.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="shrink-0 rounded text-muted hover:text-brand"
                  title={toAbsoluteChannelPageUrl(ch.channelUrl)}
                  aria-label={t('admin.kolDetail.openChannelProfile')}
                  onClick={() => openChannel(ch.channelUrl)}
                >
                  <ChannelPlatformIcon
                    platformKey={ch.platformKey}
                    className="size-5"
                  />
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  {ch.handle ? (
                    <button
                      type="button"
                      className="block truncate text-left text-sm font-medium text-brand hover:underline"
                      title={toAbsoluteChannelPageUrl(ch.channelUrl)}
                      onClick={() => openChannel(ch.channelUrl)}
                    >
                      {ch.handle}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="block truncate text-left text-sm font-medium text-ink hover:text-brand"
                      onClick={() => openChannel(ch.channelUrl)}
                    >
                      {displayPlatformLabel(
                        ch.platformKey,
                        ch.platformCustomName,
                        t,
                      )}
                    </button>
                  )}
                  {ch.followers != null ||
                  ch.contentCount != null ||
                  ch.platformKey === 'other' ? (
                    <p className="truncate text-xs text-muted">
                      {ch.followers != null
                        ? `${formatCompactNumber(ch.followers)} ${t('admin.kol.col.followers')}`
                        : null}
                      {ch.followers != null && ch.contentCount != null ? ' · ' : null}
                      {ch.contentCount != null
                        ? `${formatCompactNumber(ch.contentCount)} ${t('admin.kol.col.contentCount')}`
                        : null}
                      {ch.platformKey === 'other'
                        ? `${ch.followers != null || ch.contentCount != null ? ' · ' : ''}${displayPlatformLabel(ch.platformKey, ch.platformCustomName, t)}`
                        : null}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {kolId ? (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                      aria-label={t('admin.kolDetail.editChannelTitle')}
                      title={t('admin.kolDetail.editChannelTitle')}
                      onClick={() => openEdit(ch)}
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                  ) : null}
                  {isEnrichable(ch.platformKey) && kolId && !editing ? (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                      disabled={!apiReady || refreshingAll || refreshingId !== null}
                      aria-label={t('admin.kolDetail.refreshYoutubeStatsRowTitle')}
                      title={
                        !apiReady
                          ? t('admin.kolDetail.refreshYoutubeStatsDisabledWorkbench')
                          : t('admin.kolDetail.refreshYoutubeStatsRowTitle')
                      }
                      onClick={() => void refreshRow(ch)}
                    >
                      <RefreshIcon
                        className={`size-3.5 ${refreshingId === ch.id ? 'animate-spin' : ''}`}
                      />
                    </button>
                  ) : null}
                  {editing ? (
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                      onClick={() => void removeChannel(ch.id)}
                    >
                      <CloseIcon className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              {ch.enrichmentError ? (
                <p className="mt-1.5 text-xs leading-snug text-amber-600">
                  {ch.enrichmentError}
                </p>
              ) : null}
              {rowErrors[ch.id] ? (
                <p className="mt-1.5 text-xs leading-snug text-rose-500">
                  {rowErrors[ch.id]}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {channels.length > CHANNELS_PAGE_SIZE ? (
        <div className="border-t border-ink/10 px-4 py-2">
          <PaginationStrip
            currentPage={safePage}
            totalPages={totalPages}
            onGoToPage={setPage}
          />
        </div>
      ) : null}

      {draftPresence.mounted && draft
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                draftPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={closeModal}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={
                  draft.id
                    ? t('admin.kolDetail.editChannelTitle')
                    : t('admin.kolDetail.addChannel')
                }
                className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <h2 className="pr-2 text-base font-extrabold text-ink">
                    {draft.id
                      ? t('admin.kolDetail.editChannelTitle')
                      : t('admin.kolDetail.addChannel')}
                  </h2>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-ink/5 hover:text-ink"
                    aria-label={t('actions.close')}
                    onClick={closeModal}
                  >
                    <CloseIcon className="size-[18px]" />
                  </button>
                </div>
                {modalError ? (
                  <p className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                    {modalError}
                  </p>
                ) : null}
                <div className="space-y-4">
                  <div>
                    <label className={KOL_DETAIL_LABEL_CLASS}>
                      {t('admin.kol.col.platform')}
                    </label>
                    {draft.id ? (
                      <>
                        <p className="mb-2 text-xs leading-snug text-muted">
                          {t('admin.kolDetail.editChannelPlatformLocked')}
                        </p>
                        <div className="flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink">
                          <ChannelPlatformIcon
                            platformKey={draft.platformKey}
                            className="size-4 shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {displayPlatformLabel(
                              draft.platformKey,
                              draft.platformCustomName,
                              t,
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <CrmFilterSelect
                        className="w-full"
                        value={draft.platformKey}
                        options={platformOptions}
                        ariaLabel={t('admin.kol.col.platform')}
                        renderLeading={(option) => (
                          <ChannelPlatformIcon
                            platformKey={option.value}
                            className="size-4"
                          />
                        )}
                        onChange={(next) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  platformKey: next,
                                  platformCustomName:
                                    next === 'other' ? prev.platformCustomName : '',
                                }
                              : prev,
                          )
                        }
                      />
                    )}
                  </div>
                  <div>
                    <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-channel-url">
                      {t('admin.kolDetail.field.channelPageUrl')}
                    </label>
                    <input
                      id="kol-channel-url"
                      type="url"
                      value={draft.channelUrl}
                      placeholder={t('admin.kolDetail.field.channelPageUrlPlaceholder')}
                      className={KOL_DETAIL_INPUT_CLASS}
                      onChange={(event) =>
                        setDraft((prev) =>
                          prev ? { ...prev, channelUrl: event.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  {draft.platformKey === 'other' ? (
                    <div className="space-y-3 rounded-xl border border-ink/10 bg-canvas/40 p-3">
                      <p className="text-xs leading-snug text-muted">
                        {t('admin.kolDetail.field.otherPlatformManualHint')}
                      </p>
                      <div>
                        <label className={KOL_DETAIL_LABEL_CLASS}>
                          {t('admin.kolDetail.field.platformCustomName')}
                        </label>
                        <input
                          type="text"
                          value={draft.platformCustomName}
                          placeholder={t(
                            'admin.kolDetail.field.platformCustomNamePlaceholder',
                          )}
                          className={KOL_DETAIL_INPUT_CLASS}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev
                                ? { ...prev, platformCustomName: event.target.value }
                                : prev,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className={KOL_DETAIL_LABEL_CLASS}>
                          {t('admin.kolDetail.field.channelHandleOptional')}
                        </label>
                        <input
                          type="text"
                          value={draft.handle}
                          placeholder={t(
                            'admin.kolDetail.field.channelHandlePlaceholder',
                          )}
                          className={KOL_DETAIL_INPUT_CLASS}
                          onChange={(event) =>
                            setDraft((prev) =>
                              prev ? { ...prev, handle: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={KOL_DETAIL_LABEL_CLASS}>
                            {t('admin.kol.col.followers')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={draft.followers}
                            className={KOL_DETAIL_INPUT_CLASS}
                            onChange={(event) =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, followers: event.target.value }
                                  : prev,
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className={KOL_DETAIL_LABEL_CLASS}>
                            {t('admin.kol.col.contentCount')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={draft.contentCount}
                            className={KOL_DETAIL_INPUT_CLASS}
                            onChange={(event) =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, contentCount: event.target.value }
                                  : prev,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand dark:bg-white/10"
                    onClick={closeModal}
                  >
                    {t('admin.kolDetail.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit || saving}
                    className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                    onClick={() => void submitDraft()}
                  >
                    {saving ? t('admin.kolDetail.saving') : t('admin.kolDetail.save')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
