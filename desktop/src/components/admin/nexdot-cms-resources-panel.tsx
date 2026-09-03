/**
 * NEXDOT CMS resources panel (image ZIPs, PDFs, blog markdown).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from '@/icons/AllIcons'
import {
  createShopResourceBlogPost,
  createShopResourceDocument,
  createShopResourceImagePack,
  deleteShopResourceBlogPost,
  deleteShopResourceDocument,
  deleteShopResourceImagePack,
  fetchShopResourceBlogPosts,
  fetchShopResourceDocuments,
  fetchShopResourceImagePacks,
  formatResourceFileSize,
  reorderShopResourceBlogPosts,
  reorderShopResourceDocuments,
  reorderShopResourceImagePacks,
  slugifyResourceTitle,
  updateShopResourceBlogPost,
  updateShopResourceDocument,
  updateShopResourceImagePack,
  type ShopResourceBlogPost,
  type ShopResourceDocument,
  type ShopResourceImagePack,
} from '@/services/shop-resources-repository'
import {
  isMarkdownFile,
  isPdfFile,
  isZipFile,
  removeShopResourcesObjects,
  uploadShopResourcesFile,
} from '@/services/shop-resources-storage'

type ResourceSection = 'images' | 'documents' | 'blog'

interface NexdotCmsResourcesPanelProps {
  section: ResourceSection
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
 * Resources CMS for image packs, documents, or blog posts.
 * @param props - Section and write grants.
 * @returns Resources panel UI.
 */
export function NexdotCmsResourcesPanel({
  section,
  writes,
}: NexdotCmsResourcesPanelProps): ReactNode {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [packs, setPacks] = useState<ShopResourceImagePack[]>([])
  const [docs, setDocs] = useState<ShopResourceDocument[]>([])
  const [posts, setPosts] = useState<ShopResourceBlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      if (section === 'images') setPacks(await fetchShopResourceImagePacks())
      else if (section === 'documents') setDocs(await fetchShopResourceDocuments())
      else setPosts(await fetchShopResourceBlogPosts())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setLoading(false)
    }
  }, [section, t])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Handles resource file upload for the active section.
   * @param files - Selected files.
   */
  async function onUpload(files: FileList | null): Promise<void> {
    if (!files || !canCreate || busy) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        if (section === 'images') {
          if (!isZipFile(file)) {
            setError(t('admin.obm.resources.errorNotZip'))
            continue
          }
          const uploaded = await uploadShopResourcesFile(
            file,
            'images',
            'zip',
            'application/zip',
          )
          if ('error' in uploaded) {
            setError(uploaded.error)
            continue
          }
          await createShopResourceImagePack({
            title: file.name.replace(/\.zip$/i, ''),
            description: null,
            filePath: uploaded.path,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            sortOrder: packs.length,
            isActive: true,
          })
        } else if (section === 'documents') {
          if (!isPdfFile(file)) {
            setError(t('admin.obm.resources.errorNotPdf'))
            continue
          }
          const uploaded = await uploadShopResourcesFile(
            file,
            'documents',
            'pdf',
            'application/pdf',
          )
          if ('error' in uploaded) {
            setError(uploaded.error)
            continue
          }
          await createShopResourceDocument({
            title: file.name.replace(/\.pdf$/i, ''),
            description: null,
            filePath: uploaded.path,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            sortOrder: docs.length,
            isActive: true,
          })
        } else {
          if (!isMarkdownFile(file)) {
            setError(t('admin.obm.resources.errorNotMarkdown'))
            continue
          }
          const bodyMarkdown = await file.text()
          const title = file.name.replace(/\.(md|markdown)$/i, '')
          await createShopResourceBlogPost({
            title,
            slug: slugifyResourceTitle(title),
            bodyMarkdown,
            excerpt: null,
            publishedAt: new Date().toISOString(),
            sortOrder: posts.length,
            isActive: true,
          })
        }
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obm.loading'))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const titleKey =
    section === 'images'
      ? 'admin.obm.resources.imagesTitle'
      : section === 'documents'
        ? 'admin.obm.resources.documentsTitle'
        : 'admin.obm.resources.blogTitle'
  const hintKey =
    section === 'images'
      ? 'admin.obm.resources.imagesHint'
      : section === 'documents'
        ? 'admin.obm.resources.documentsHint'
        : 'admin.obm.resources.blogHint'
  const uploadLabel =
    section === 'images'
      ? t('admin.obm.resources.uploadZip')
      : section === 'documents'
        ? t('admin.obm.resources.uploadPdf')
        : t('admin.obm.resources.uploadMarkdown')
  const accept =
    section === 'images' ? '.zip,application/zip' : section === 'documents' ? '.pdf' : '.md,.markdown,text/markdown'

  if (loading) {
    return <p className="text-sm font-medium text-ink">{t('admin.obm.loading')}</p>
  }

  return (
    <section className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-ink">{t(titleKey)}</h3>
          <p className="text-xs text-muted">{t(hintKey)}</p>
        </div>
        {canCreate ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              multiple={section !== 'blog'}
              className="hidden"
              onChange={(e) => void onUpload(e.target.files)}
            />
            <button
              type="button"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? t('admin.obm.uploading') : uploadLabel}
            </button>
          </>
        ) : null}
      </div>

      {error ? <p className="px-4 pt-3 text-sm text-rose-500">{error}</p> : null}

      {section === 'images' ? (
        packs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('admin.obm.resources.emptyImages')}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {packs.map((pack, index) => (
              <li key={pack.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <input
                  className="min-w-40 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || busy}
                  defaultValue={pack.title}
                  onBlur={(e) => {
                    if (!canEdit || e.target.value === pack.title) return
                    void updateShopResourceImagePack(pack.id, {
                      title: e.target.value,
                    }).then(load)
                  }}
                />
                <span className="text-xs text-muted">
                  {pack.fileName} · {formatResourceFileSize(pack.fileSize)}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void updateShopResourceImagePack(pack.id, {
                      isActive: !pack.isActive,
                    }).then(load)
                  }
                >
                  {pack.isActive ? t('admin.obm.active') : t('admin.obm.inactive')}
                </button>
                <ReorderButtons
                  canEdit={canEdit && !busy}
                  index={index}
                  last={index === packs.length - 1}
                  onMove={(dir) => {
                    const next = moveId(
                      packs.map((p) => p.id),
                      pack.id,
                      dir,
                    )
                    if (next) void reorderShopResourceImagePacks(next).then(load)
                  }}
                />
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t('admin.obm.resources.deleteImageConfirm')))
                        return
                      void (async () => {
                        await deleteShopResourceImagePack(pack.id)
                        await removeShopResourcesObjects([pack.filePath])
                        await load()
                      })()
                    }}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {section === 'documents' ? (
        docs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            {t('admin.obm.resources.emptyDocuments')}
          </p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {docs.map((doc, index) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <input
                  className="min-w-40 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                  disabled={!canEdit || busy}
                  defaultValue={doc.title}
                  onBlur={(e) => {
                    if (!canEdit || e.target.value === doc.title) return
                    void updateShopResourceDocument(doc.id, {
                      title: e.target.value,
                    }).then(load)
                  }}
                />
                <span className="text-xs text-muted">
                  {doc.fileName} · {formatResourceFileSize(doc.fileSize)}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void updateShopResourceDocument(doc.id, {
                      isActive: !doc.isActive,
                    }).then(load)
                  }
                >
                  {doc.isActive ? t('admin.obm.active') : t('admin.obm.inactive')}
                </button>
                <ReorderButtons
                  canEdit={canEdit && !busy}
                  index={index}
                  last={index === docs.length - 1}
                  onMove={(dir) => {
                    const next = moveId(
                      docs.map((d) => d.id),
                      doc.id,
                      dir,
                    )
                    if (next) void reorderShopResourceDocuments(next).then(load)
                  }}
                />
                {canDelete ? (
                  <button
                    type="button"
                    className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t('admin.obm.resources.deleteDocConfirm')))
                        return
                      void (async () => {
                        await deleteShopResourceDocument(doc.id)
                        await removeShopResourcesObjects([doc.filePath])
                        await load()
                      })()
                    }}
                  >
                    <TrashIcon className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {section === 'blog' ? (
        posts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">{t('admin.obm.resources.emptyBlog')}</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {posts.map((post, index) => (
              <li key={post.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    className="min-w-40 flex-1 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                    disabled={!canEdit || busy}
                    defaultValue={post.title}
                    onBlur={(e) => {
                      if (!canEdit || e.target.value === post.title) return
                      void updateShopResourceBlogPost(post.id, {
                        title: e.target.value,
                      }).then(load)
                    }}
                  />
                  <input
                    className="min-w-32 rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm text-ink dark:bg-zinc-900"
                    disabled={!canEdit || busy}
                    defaultValue={post.slug}
                    aria-label={t('admin.obm.resources.colSlug')}
                    onBlur={(e) => {
                      if (!canEdit || e.target.value === post.slug) return
                      void updateShopResourceBlogPost(post.id, {
                        slug: e.target.value,
                      }).then(load)
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                    disabled={!canEdit || busy}
                    onClick={() =>
                      void updateShopResourceBlogPost(post.id, {
                        isActive: !post.isActive,
                      }).then(load)
                    }
                  >
                    {post.isActive ? t('admin.obm.active') : t('admin.obm.inactive')}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold"
                    onClick={() =>
                      setPreviewId((id) => (id === post.id ? null : post.id))
                    }
                  >
                    {previewId === post.id
                      ? t('admin.obm.resources.hidePreview')
                      : t('admin.obm.resources.preview')}
                  </button>
                  <ReorderButtons
                    canEdit={canEdit && !busy}
                    index={index}
                    last={index === posts.length - 1}
                    onMove={(dir) => {
                      const next = moveId(
                        posts.map((p) => p.id),
                        post.id,
                        dir,
                      )
                      if (next) void reorderShopResourceBlogPosts(next).then(load)
                    }}
                  />
                  {canDelete ? (
                    <button
                      type="button"
                      className="rounded p-1 text-rose-500 hover:bg-rose-500/10"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(t('admin.obm.resources.deleteBlogConfirm')))
                          return
                        void deleteShopResourceBlogPost(post.id).then(load)
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  ) : null}
                </div>
                {previewId === post.id ? (
                  <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-ink whitespace-pre-wrap dark:bg-zinc-900">
                    {post.bodyMarkdown}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

interface ReorderButtonsProps {
  canEdit: boolean
  index: number
  last: boolean
  onMove: (direction: 'up' | 'down') => void
}

/**
 * Up/down reorder controls.
 * @param props - Index and handlers.
 * @returns Button pair.
 */
function ReorderButtons({
  canEdit,
  index,
  last,
  onMove,
}: ReorderButtonsProps): ReactNode {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
        disabled={!canEdit || index === 0}
        onClick={() => onMove('up')}
      >
        <ChevronUpIcon className="size-4" />
      </button>
      <button
        type="button"
        className="rounded p-1 text-muted hover:text-ink disabled:opacity-40"
        disabled={!canEdit || last}
        onClick={() => onMove('down')}
      >
        <ChevronDownIcon className="size-4" />
      </button>
    </div>
  )
}
