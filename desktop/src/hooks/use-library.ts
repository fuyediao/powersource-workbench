import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  FUNCTION_APPS,
  FUNCTIONS_CATEGORY,
  FUNCTIONS_CATEGORY_ID,
  isFunctionsCategory,
  WEBSITES_CATEGORY_ID,
} from '@/constants/rail-categories'
import {
  createCategoryApp,
  fetchCategories,
  fetchCategoryApps,
  linkCategorySite,
  removeCategoryApp,
  saveCategoryOrder,
} from '@/utils/home/library-api'
import type { AppItem, Category } from '@/types/library'

interface CreateAppFields {
  url: string
  name: string
}

interface LibraryState {
  categories: Category[]
  items: AppItem[]
  loading: boolean
  error: string | null
  reorderItems: (itemIds: string[]) => void
  createItem: (fields: CreateAppFields) => Promise<void>
  removeItem: (appId: string) => Promise<void>
  linkItem: (siteId: string) => Promise<void>
}

/**
 * Merges the virtual Functions tab in front of local website categories.
 * @param dbCategories - Categories loaded from the Home library SQLite store.
 * @returns Rail categories for the UI.
 */
function mergeRailCategories(dbCategories: Category[]): Category[] {
  const websites =
    dbCategories.find((category) => category.id === WEBSITES_CATEGORY_ID) ??
    ({ id: WEBSITES_CATEGORY_ID, position: 1 } satisfies Category)
  return [
    FUNCTIONS_CATEGORY,
    { ...websites, position: 1 },
    ...dbCategories
      .filter((category) => category.id !== WEBSITES_CATEGORY_ID)
      .map((category, index) => ({ ...category, position: index + 2 })),
  ]
}

/**
 * Connects React state to the local SQLite library for Websites.
 * Functions is a frontend-only rail tab with code-defined tiles.
 * @param userId - Authenticated user id, or null while unavailable.
 * @param categoryId - Currently selected category.
 * @returns Library state and mutating actions.
 */
export function useLibrary(userId: string | null, categoryId: string): LibraryState {
  const [dbCategories, setDbCategories] = useState<Category[]>([])
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, AppItem[]>>(() => {
    const initial: Record<string, AppItem[]> = {}
    initial[FUNCTIONS_CATEGORY_ID] = FUNCTION_APPS
    return initial
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cacheOwnerRef = useRef<string | null>(null)
  const categoryIdRef = useRef(categoryId)
  const itemsByCategoryRef = useRef(itemsByCategory)
  categoryIdRef.current = categoryId
  itemsByCategoryRef.current = itemsByCategory

  const categories = useMemo(() => mergeRailCategories(dbCategories), [dbCategories])

  useEffect(() => {
    if (!userId) {
      setDbCategories([])
      const empty: Record<string, AppItem[]> = {}
      empty[FUNCTIONS_CATEGORY_ID] = FUNCTION_APPS
      setItemsByCategory(empty)
      cacheOwnerRef.current = null
      setLoading(false)
      return
    }

    if (cacheOwnerRef.current !== userId) {
      cacheOwnerRef.current = userId
      const reset: Record<string, AppItem[]> = {}
      reset[FUNCTIONS_CATEGORY_ID] = FUNCTION_APPS
      setItemsByCategory(reset)
    }

    let active = true
    setLoading(true)
    fetchCategories()
      .then((nextCategories) => {
        if (!active) {
          return
        }
        setDbCategories(nextCategories)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Library request failed.')
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId || categories.length === 0) {
      return
    }

    let active = true
    const signedInUserId: string = userId
    const priorityId: string = categoryIdRef.current || categories[0]?.id || ''
    if (!priorityId) {
      return
    }

    /**
     * Loads the selected website category first, then prefetches the rest.
     * @returns Nothing.
     */
    async function warmLibrary(): Promise<void> {
      const dbIds = categories
        .map((category) => category.id)
        .filter((id) => !isFunctionsCategory(id))

      try {
        if (!isFunctionsCategory(priorityId)) {
          const priorityItems = await fetchCategoryApps(signedInUserId, priorityId)
          if (!active) {
            return
          }
          setItemsByCategory((current) => ({
            ...current,
            [FUNCTIONS_CATEGORY_ID]: FUNCTION_APPS,
            [priorityId]: priorityItems,
          }))
          setError(null)
        } else {
          setItemsByCategory((current) => ({
            ...current,
            [FUNCTIONS_CATEGORY_ID]: FUNCTION_APPS,
          }))
        }
      } catch (reason: unknown) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Library request failed.')
        }
      }

      const otherIds = dbIds.filter((id) => id !== priorityId)
      const settled = await Promise.all(
        otherIds.map(async (id) => {
          try {
            return { id, items: await fetchCategoryApps(signedInUserId, id) }
          } catch {
            return null
          }
        }),
      )
      if (!active) {
        return
      }
      setItemsByCategory((current) => {
        const next: Record<string, AppItem[]> = {
          ...current,
          [FUNCTIONS_CATEGORY_ID]: FUNCTION_APPS,
        }
        for (const row of settled) {
          if (row) {
            next[row.id] = row.items
          }
        }
        return next
      })
    }

    void warmLibrary()

    return () => {
      active = false
    }
  }, [userId, categories])

  useEffect(() => {
    if (!userId || !categoryId || isFunctionsCategory(categoryId)) {
      return
    }
    if (Object.prototype.hasOwnProperty.call(itemsByCategoryRef.current, categoryId)) {
      return
    }

    let active = true
    fetchCategoryApps(userId, categoryId)
      .then((nextItems) => {
        if (active) {
          setItemsByCategory((current) => ({ ...current, [categoryId]: nextItems }))
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Library request failed.')
        }
      })

    return () => {
      active = false
    }
  }, [userId, categoryId])

  /**
   * Writes the active category's app list into local cache and React state.
   * @param nextItems - Ordered apps for the active category.
   * @returns Nothing.
   */
  function writeCategoryItems(nextItems: AppItem[]): void {
    setItemsByCategory((current) => ({ ...current, [categoryId]: nextItems }))
  }

  /**
   * Persists grid order for website categories.
   * @param itemIds - Ordered item identifiers.
   * @returns Nothing.
   */
  function reorderItems(itemIds: string[]): void {
    if (isFunctionsCategory(categoryId)) {
      return
    }
    startTransition(() => {
      setItemsByCategory((current) => {
        const existing = current[categoryId] ?? []
        const byId = new Map(existing.map((item) => [item.id, item]))
        return {
          ...current,
          [categoryId]: itemIds.flatMap((id, position) => {
            const item = byId.get(id)
            return item ? [{ ...item, position }] : []
          }),
        }
      })
    })
    if (!userId) {
      return
    }
    void saveCategoryOrder(userId, categoryId, itemIds).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Reorder failed.')
    })
  }

  /**
   * Creates an app in the active website category.
   * @param fields - New app fields.
   * @returns Resolves when SQLite accepts the create.
   */
  async function createItem(fields: CreateAppFields): Promise<void> {
    if (!userId || isFunctionsCategory(categoryId)) {
      return
    }
    const created = await createCategoryApp(userId, categoryId, {
      url: fields.url,
      name: fields.name.trim(),
    })
    startTransition(() => {
      setItemsByCategory((current) => ({
        ...current,
        [categoryId]: [...(current[categoryId] ?? []), created],
      }))
    })
  }

  /**
   * Unlinks an app from the active website category.
   * @param appId - Site id to remove from this category.
   * @returns Resolves when SQLite accepts the remove.
   */
  async function removeItem(appId: string): Promise<void> {
    if (!userId || isFunctionsCategory(categoryId)) {
      return
    }
    const remaining = await removeCategoryApp(userId, categoryId, appId)
    startTransition(() => {
      writeCategoryItems(remaining)
    })
  }

  /**
   * Links an existing site into the active website category.
   * @param siteId - Existing site id.
   * @returns Resolves when SQLite accepts the link.
   */
  async function linkItem(siteId: string): Promise<void> {
    if (!userId || isFunctionsCategory(categoryId)) {
      return
    }
    const linked = await linkCategorySite(userId, categoryId, siteId)
    startTransition(() => {
      setItemsByCategory((current) => ({
        ...current,
        [categoryId]: [...(current[categoryId] ?? []), linked],
      }))
    })
  }

  return {
    categories,
    items: isFunctionsCategory(categoryId)
      ? FUNCTION_APPS
      : (itemsByCategory[categoryId] ?? []),
    loading,
    error,
    reorderItems,
    createItem,
    removeItem,
    linkItem,
  }
}
