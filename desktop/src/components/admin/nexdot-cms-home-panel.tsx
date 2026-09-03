/**
 * NEXDOT CMS homepage panel: banners, stories, featured products.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import {
  listProductCatalog,
  productCatalogObmLabel,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'
import {
  createShopFeaturedProduct,
  createShopHomeBanner,
  createShopHomeStory,
  deleteShopFeaturedProduct,
  deleteShopHomeBanner,
  deleteShopHomeStory,
  fetchShopFeaturedProducts,
  fetchShopHomeBanners,
  fetchShopHomeStories,
  reorderShopFeaturedProducts,
  reorderShopHomeBanners,
  reorderShopHomeStories,
  updateShopHomeBanner,
  updateShopHomeStory,
  type ShopFeaturedProduct,
  type ShopHomeBanner,
  type ShopHomeStory,
} from '@/services/shop-home-repository'
import {
  removeShopHomeObjects,
  uploadShopHomeBanner,
  uploadShopHomeStory,
} from '@/services/shop-home-storage'

const MAX_FEATURED_PRODUCTS = 8
const MAX_STORIES = 7

interface NexdotCmsHomePanelProps {
  writes: AdminShellWrites | null
}

/**
 * Moves an id one step in an ordered list.
 * @param ids - Current order.
 * @param id - Target id.
 * @param direction - Up or down.
 * @returns New order or null when unchanged.
 */
function moveId(
  ids: string[],
  id: string,
  direction: 'up' | 'down',
): string[] | null {
  const index = ids.indexOf(id)
  if (index < 0) return null
  const swap = direction === 'up' ? index - 1 : index + 1
  if (swap < 0 || swap >= ids.length) return null
  const next = ids.slice()
  ;[next[index], next[swap]] = [next[swap], next[index]]
  return next
}

/**
 * Homepage CMS sections for banners, stories, and featured products.
 * @param props - Write grants.
 * @returns Home panel UI.
 */
export function NexdotCmsHomePanel({ writes }: NexdotCmsHomePanelProps): ReactNode {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [banners, setBanners] = useState<ShopHomeBanner[]>([])
  const [stories, setStories] = useState<ShopHomeStory[]>([])
  const [featured, setFeatured] = useState<ShopFeaturedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [featuredOpen, setFeaturedOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProductCatalogItem[]>([])
  const [searching, setSearching] = useState(false)

  const bannerInputRef = useRef<HTMLInputElement>(null)
  const storyInputRef = useRef<HTMLInputElement>(null)

  const loadAll = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const [nextBanners, nextStories, nextFeatured] = await Promise.all([
        fetchShopHomeBanners(),
        fetchShopHomeStories(),
        fetchShopFeaturedProducts(),
      ])
      setBanners(nextBanners)
      setStories(nextStories)
      setFeatured(nextFeatured)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  /**
   * Uploads banner images and creates rows.
   * @param files - Image files.
   */
  async function onUploadBanners(files: FileList | null): Promise<void> {
    if (!files || !canCreate || busy) return
    setBusy(true)
    setError(null)
    try {
      let sortOrder = banners.length
      for (const file of Array.from(files)) {
        const uploaded = await uploadShopHomeBanner(file)
        if ('error' in uploaded) {
          setError(
            uploaded.error === 'not_image'
              ? t('admin.obm.errorNotImage')
              : uploaded.error,
          )
          continue
        }
        await createShopHomeBanner({
          imagePath: uploaded.path,
          thumbnailPath: uploaded.thumbnailPath,
          href: null,
          sortOrder,
          isActive: true,
        })
        sortOrder += 1
      }
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  /**
   * Uploads story images (respecting max count).
   * @param files - Image files.
   */
  async function onUploadStories(files: FileList | null): Promise<void> {
    if (!files || !canCreate || busy) return
    const remaining = MAX_STORIES - stories.length
    if (remaining <= 0) return
    setBusy(true)
    setError(null)
    try {
      let sortOrder = stories.length
      for (const file of Array.from(files).slice(0, remaining)) {
        const uploaded = await uploadShopHomeStory(file)
        if ('error' in uploaded) {
          setError(
            uploaded.error === 'not_image'
              ? t('admin.obm.errorNotImage')
              : uploaded.error,
          )
          continue
        }
        await createShopHomeStory({
          imagePath: uploaded.path,
          thumbnailPath: uploaded.thumbnailPath,
          title: '',
          href: null,
          sortOrder,
          isActive: true,
        })
        sortOrder += 1
      }
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
      if (storyInputRef.current) storyInputRef.current.value = ''
    }
  }

  /**
   * Deletes a banner after confirm.
   * @param banner - Target banner.
   */
  async function onDeleteBanner(banner: ShopHomeBanner): Promise<void> {
    if (!canDelete) return
    if (!window.confirm(t('admin.obm.deleteBannerConfirm'))) return
    setBusy(true)
    try {
      await deleteShopHomeBanner(banner.id)
      await removeShopHomeObjects(
        [banner.imagePath, banner.thumbnailPath].filter(
          (p): p is string => Boolean(p),
        ),
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Deletes a story after confirm.
   * @param story - Target story.
   */
  async function onDeleteStory(story: ShopHomeStory): Promise<void> {
    if (!canDelete) return
    if (!window.confirm(t('admin.obm.deleteStoryConfirm'))) return
    setBusy(true)
    try {
      await deleteShopHomeStory(story.id)
      await removeShopHomeObjects(
        [story.imagePath, story.thumbnailPath].filter(
          (p): p is string => Boolean(p),
        ),
      )
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Searches catalog for featured picker.
   * @param query - Search text.
   */
  async function runFeaturedSearch(query: string): Promise<void> {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const result = await listProductCatalog({
        search: query.trim(),
        page: 1,
        pageSize: 20,
        status: 'active',
      })
      setSearchResults(result.items)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  /**
   * Adds a featured product pick.
   * @param item - Catalog row.
   */
  async function onAddFeatured(item: ProductCatalogItem): Promise<void> {
    if (!canCreate || featured.length >= MAX_FEATURED_PRODUCTS) return
    if (featured.some((f) => f.productId === item.id)) return
    setBusy(true)
    try {
      await createShopFeaturedProduct(item, featured.length)
      setFeaturedOpen(false)
      setSearchQuery('')
      setSearchResults([])
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm font-medium text-ink">{t('admin.obm.loading')}</p>
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-ink">{t('admin.obm.sectionBanners')}</h3>
            <p className="text-xs text-muted">{t('admin.obm.sectionBannersHint')}</p>
          </div>
          {canCreate ? (
            <>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onUploadBanners(e.target.files)}
              />
              <button
                type="button"
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                disabled={busy}
                onClick={() => bannerInputRef.current?.click()}
              >
                {busy ? t('admin.obm.uploading') : t('admin.obm.uploadBanners')}
              </button>
            </>
          ) : null}
        </div>
        {banners.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('admin.obm.emptyBanners')}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {banners.map((banner, index) => (
              <li key={banner.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <img
                  src={banner.thumbnailPublicUrl ?? banner.publicUrl}
                  alt=""
                  className="size-16 rounded-lg object-cover"
                />
                <input
                  className="min-w-48 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || busy}
                  placeholder={t('admin.obm.linkPlaceholder')}
                  defaultValue={banner.href ?? ''}
                  onBlur={(e) => {
                    if (!canEdit) return
                    const href = e.target.value.trim() || null
                    if (href === banner.href) return
                    void updateShopHomeBanner(banner.id, { href }).then(loadAll)
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void updateShopHomeBanner(banner.id, {
                      isActive: !banner.isActive,
                    }).then(loadAll)
                  }
                >
                  {banner.isActive ? t('admin.obm.active') : t('admin.obm.inactive')}
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === 0}
                    aria-label={t('admin.obm.dragHandle')}
                    onClick={() => {
                      const next = moveId(
                        banners.map((b) => b.id),
                        banner.id,
                        'up',
                      )
                      if (next) void reorderShopHomeBanners(next).then(loadAll)
                    }}
                  >
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === banners.length - 1}
                    aria-label={t('admin.obm.dragHandle')}
                    onClick={() => {
                      const next = moveId(
                        banners.map((b) => b.id),
                        banner.id,
                        'down',
                      )
                      if (next) void reorderShopHomeBanners(next).then(loadAll)
                    }}
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={() => void onDeleteBanner(banner)}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-ink">{t('admin.obm.sectionStories')}</h3>
            <p className="text-xs text-muted">
              {t('admin.obm.sectionStoriesHint', {
                count: stories.length,
                max: MAX_STORIES,
              })}
            </p>
          </div>
          {canCreate && stories.length < MAX_STORIES ? (
            <>
              <input
                ref={storyInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onUploadStories(e.target.files)}
              />
              <button
                type="button"
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                disabled={busy}
                onClick={() => storyInputRef.current?.click()}
              >
                {t('admin.obm.uploadStories')}
              </button>
            </>
          ) : null}
        </div>
        {stories.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('admin.obm.emptyStories')}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {stories.map((story, index) => (
              <li key={story.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <img
                  src={story.thumbnailPublicUrl ?? story.publicUrl}
                  alt=""
                  className="size-16 rounded-lg object-cover"
                />
                <input
                  className="min-w-32 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || busy}
                  defaultValue={story.title}
                  onBlur={(e) => {
                    if (!canEdit) return
                    const title = e.target.value
                    if (title === story.title) return
                    void updateShopHomeStory(story.id, { title }).then(loadAll)
                  }}
                />
                <input
                  className="min-w-40 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || busy}
                  placeholder={t('admin.obm.linkPlaceholder')}
                  defaultValue={story.href ?? ''}
                  onBlur={(e) => {
                    if (!canEdit) return
                    const href = e.target.value.trim() || null
                    if (href === story.href) return
                    void updateShopHomeStory(story.id, { href }).then(loadAll)
                  }}
                />
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void updateShopHomeStory(story.id, {
                      isActive: !story.isActive,
                    }).then(loadAll)
                  }
                >
                  {story.isActive ? t('admin.obm.active') : t('admin.obm.inactive')}
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === 0}
                    onClick={() => {
                      const next = moveId(
                        stories.map((s) => s.id),
                        story.id,
                        'up',
                      )
                      if (next) void reorderShopHomeStories(next).then(loadAll)
                    }}
                  >
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === stories.length - 1}
                    onClick={() => {
                      const next = moveId(
                        stories.map((s) => s.id),
                        story.id,
                        'down',
                      )
                      if (next) void reorderShopHomeStories(next).then(loadAll)
                    }}
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={() => void onDeleteStory(story)}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-ink">{t('admin.obm.sectionFeatured')}</h3>
            <p className="text-xs text-muted">
              {t('admin.obm.sectionFeaturedHint', {
                count: featured.length,
                max: MAX_FEATURED_PRODUCTS,
              })}
            </p>
          </div>
          {canCreate && featured.length < MAX_FEATURED_PRODUCTS ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg"
              onClick={() => setFeaturedOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              {t('admin.obm.addFeatured')}
            </button>
          ) : null}
        </div>
        {featured.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('admin.obm.emptyFeatured')}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {featured.map((row, index) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {row.imageUrl ? (
                  <img src={row.imageUrl} alt="" className="size-12 rounded object-cover" />
                ) : (
                  <div className="size-12 rounded bg-zinc-100 dark:bg-zinc-800" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                  <p className="text-xs text-muted">{row.itemCode}</p>
                  {!row.isActive ? (
                    <p className="text-xs text-amber-600">{t('admin.obm.inactiveCatalogWarning')}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === 0}
                    onClick={() => {
                      const next = moveId(
                        featured.map((f) => f.id),
                        row.id,
                        'up',
                      )
                      if (next) void reorderShopFeaturedProducts(next).then(loadAll)
                    }}
                  >
                    <ChevronUpIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
                    disabled={!canEdit || busy || index === featured.length - 1}
                    onClick={() => {
                      const next = moveId(
                        featured.map((f) => f.id),
                        row.id,
                        'down',
                      )
                      if (next) void reorderShopFeaturedProducts(next).then(loadAll)
                    }}
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          t('admin.obm.deleteFeaturedConfirm', { name: row.name }),
                        )
                      ) {
                        return
                      }
                      void deleteShopFeaturedProduct(row.id).then(loadAll)
                    }}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {featuredOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl dark:bg-zinc-950">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <h3 className="text-sm font-bold text-ink">{t('admin.obm.addFeaturedTitle')}</h3>
              <button
                type="button"
                className="text-xs font-semibold text-muted hover:text-ink"
                onClick={() => setFeaturedOpen(false)}
              >
                {t('admin.obm.cancel')}
              </button>
            </div>
            <div className="space-y-3 p-4">
              <input
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink dark:bg-zinc-900"
                placeholder={t('admin.obm.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => void runFeaturedSearch(e.target.value)}
              />
              <div className="max-h-72 overflow-auto rounded-lg border border-ink/10">
                {searching ? (
                  <p className="p-3 text-sm text-muted">{t('admin.obm.loading')}</p>
                ) : searchResults.length === 0 ? (
                  <p className="p-3 text-sm text-muted">{t('admin.obm.noSearchResults')}</p>
                ) : (
                  <ul className="divide-y divide-ink/10">
                    {searchResults.map((item) => {
                      const already = featured.some((f) => f.productId === item.id)
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {productCatalogObmLabel(item)}
                            </p>
                            <p className="text-xs text-muted">{item.itemCode}</p>
                          </div>
                          <button
                            type="button"
                            className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-bold text-brand-fg disabled:opacity-50"
                            disabled={already || busy}
                            onClick={() => void onAddFeatured(item)}
                          >
                            {already ? t('admin.obm.alreadyFeatured') : t('admin.obm.add')}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
