/**
 * Admin competitor product line detail / create pane.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CompetitorPhotoUrlListField } from '@/components/admin/competitor-photo-url-list-field'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { COMPETITOR_THREAT_VALUES } from '@/constants/competitor-constants'
import { ArrowLeftIcon } from '@/icons/AllIcons'
import {
  createCompetitorLine,
  deleteCompetitorLine,
  getCompetitorLine,
  updateCompetitorLine,
} from '@/services/competitor-lines-api'
import { getCompetitorShop } from '@/services/competitor-shops-api'
import { uploadCompetitorProductPhoto } from '@/services/competitor-storage'
import type {
  CompetitorLineInput,
  CompetitorThreatLevel,
} from '@/types/competitor'
import { competitorLinePath, competitorShopPath } from '@/utils/competitor-routes'
import { normalizeCompetitorPhotoUrlList } from '@/utils/competitor-photo-urls'

interface CompetitorLinePaneProps {
  shopId: string
  /** Null when creating a new line. */
  lineId: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/**
 * Builds a blank line form model.
 * @returns Empty line input.
 */
function emptyForm(): CompetitorLineInput {
  return {
    competitorCompanyName: null,
    competitorProductName: null,
    price: null,
    salesQuantity: null,
    threatLevel: null,
    remarks: null,
    productPhotoUrls: [],
  }
}

/**
 * Normalizes a text input into a nullable stored value.
 * @param value - Raw input.
 * @returns Trimmed string, or null.
 */
function textValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Normalizes a numeric input into a nullable stored value.
 * @param value - Raw input.
 * @returns Finite number, or null.
 */
function numberValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Competitor line editor with create, update, and delete.
 * @param props - Ids, writes, and navigation.
 * @returns Line UI.
 */
export function CompetitorLinePane({
  shopId,
  lineId,
  writes,
  onNavigate,
}: CompetitorLinePaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const isCreate = lineId === null

  const [form, setForm] = useState<CompetitorLineInput>(emptyForm)
  const [shopGroupId, setShopGroupId] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(!isCreate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const threatOptions = useMemo(
    () => [
      { value: '', label: t('admin.competitor.threatUnset') },
      ...COMPETITOR_THREAT_VALUES.map((level) => ({
        value: level,
        label: t(`admin.competitor.threat.${level}`),
      })),
    ],
    [t],
  )

  /**
   * Loads the line for edit mode.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (isCreate || !lineId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const line = await getCompetitorLine(shopId, lineId)
      if (!line) {
        setError(t('admin.competitor.error.load'))
        return
      }
      setForm({
        competitorCompanyName: line.competitorCompanyName,
        competitorProductName: line.competitorProductName,
        price: line.price,
        salesQuantity: line.salesQuantity,
        threatLevel: line.threatLevel,
        remarks: line.remarks,
        productPhotoUrls: [...line.productPhotoUrls],
      })
      setShopGroupId(line.groupId)
    } catch (err) {
      console.error('[CompetitorLinePane] load:', err)
      setError(t('admin.competitor.error.load'))
    } finally {
      setLoading(false)
    }
  }, [isCreate, lineId, shopId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Updates one form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<CompetitorLineInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Saves the create or update form.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving) {
      return
    }
    if (!form.competitorCompanyName && !form.competitorProductName) {
      setError(t('admin.competitor.error.lineProductRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreate) {
        if (!canCreate) {
          return
        }
        const shop = await getCompetitorShop(shopId)
        if (!shop) {
          setError(t('admin.competitor.error.load'))
          return
        }
        setShopGroupId(shop.groupId)
        let created = await createCompetitorLine(shopId, shop.groupId, {
          ...form,
          productPhotoUrls: [],
        })
        if (pendingPhotos.length > 0) {
          let merged = [...created.productPhotoUrls]
          for (const file of pendingPhotos) {
            const up = await uploadCompetitorProductPhoto(
              shop.groupId,
              shopId,
              created.id,
              file,
            )
            if ('error' in up) {
              setError(
                up.error === 'not_image'
                  ? t('admin.competitor.photoUrls.errorNotImage')
                  : up.error === 'file_too_large'
                    ? t('admin.competitor.photoUrls.errorFileTooLarge')
                    : up.error === 'Storage is not configured'
                      ? t('admin.competitor.photoUrls.errorStorage')
                      : up.error,
              )
              return
            }
            merged = normalizeCompetitorPhotoUrlList([...merged, up.publicUrl])
          }
          created = await updateCompetitorLine(created.id, {
            ...form,
            productPhotoUrls: merged,
          })
        }
        onNavigate(competitorLinePath(shopId, created.id))
        return
      }
      if (!canEdit || !lineId) {
        return
      }
      await updateCompetitorLine(lineId, form)
      onNavigate(competitorShopPath(shopId))
    } catch (err) {
      console.error('[CompetitorLinePane] save:', err)
      setError(t('admin.competitor.error.save'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the line and returns to the shop detail.
   * @returns Nothing.
   */
  async function remove(): Promise<void> {
    if (!lineId || !canDelete || saving) {
      return
    }
    setSaving(true)
    try {
      await deleteCompetitorLine(lineId)
      onNavigate(competitorShopPath(shopId))
    } catch (err) {
      console.error('[CompetitorLinePane] delete:', err)
      setError(t('admin.competitor.error.delete'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.competitor.backToShop')}
          aria-label={t('admin.competitor.backToShop')}
          onClick={() => onNavigate(competitorShopPath(shopId))}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {isCreate
            ? t('admin.competitor.addLine')
            : t('admin.competitor.lineDetailTitle')}
        </h1>
        {!isCreate && canDelete ? (
          <button
            type="button"
            disabled={saving}
            className="shrink-0 rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500 disabled:opacity-50"
            onClick={() => void remove()}
          >
            {t('admin.kolDetail.delete')}
          </button>
        ) : null}
        {(isCreate && canCreate) || (!isCreate && canEdit) ? (
          <button
            type="button"
            disabled={saving}
            className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void submit()}
          >
            {saving ? t('admin.kolDetail.saving') : t('admin.kolDetail.save')}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : null}

        {!loading ? (
          <section className={detailSectionCardClass()}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.companyName')}
                </span>
                <input
                  type="text"
                  value={form.competitorCompanyName ?? ''}
                  onChange={(e) =>
                    patchForm({
                      competitorCompanyName: textValue(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.productName')}
                </span>
                <input
                  type="text"
                  value={form.competitorProductName ?? ''}
                  onChange={(e) =>
                    patchForm({
                      competitorProductName: textValue(e.target.value),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.price')}
                </span>
                <input
                  type="number"
                  step="any"
                  value={form.price ?? ''}
                  onChange={(e) =>
                    patchForm({ price: numberValue(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.salesQuantity')}
                </span>
                <input
                  type="number"
                  value={form.salesQuantity ?? ''}
                  onChange={(e) =>
                    patchForm({ salesQuantity: numberValue(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>
              <div className="space-y-1.5">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.threatLevel')}
                </span>
                <CrmFilterSelect
                  className="w-full"
                  value={form.threatLevel ?? ''}
                  options={threatOptions}
                  ariaLabel={t('admin.competitor.lineField.threatLevel')}
                  onChange={(next) =>
                    patchForm({
                      threatLevel: (next || null) as CompetitorThreatLevel | null,
                    })
                  }
                />
              </div>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className={labelClass}>
                  {t('admin.competitor.lineField.remarks')}
                </span>
                <textarea
                  rows={3}
                  value={form.remarks ?? ''}
                  onChange={(e) =>
                    patchForm({ remarks: textValue(e.target.value) })
                  }
                  className={inputClass}
                />
              </label>
              <div className="space-y-1.5 sm:col-span-2">
                <span className={labelClass}>
                  {t('admin.competitor.photoUrls.productPhotos')}
                </span>
                <CompetitorPhotoUrlListField
                  idPrefix="comp-line-product-photos"
                  variant="line"
                  uploadMode={isCreate ? 'deferred' : 'live'}
                  groupId={shopGroupId}
                  shopId={shopId}
                  lineId={lineId}
                  urls={form.productPhotoUrls}
                  onUrlsChange={(next) => patchForm({ productPhotoUrls: next })}
                  pendingFiles={pendingPhotos}
                  onPendingFilesChange={setPendingPhotos}
                />
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
