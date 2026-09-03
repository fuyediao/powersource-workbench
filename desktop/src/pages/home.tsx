import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppGrid } from '@/components/home/apps/AppGrid'
import { StatusLoading } from '@/components/common/status-loading'
import { DateTimeDisplay } from '@/components/home/header/DateTimeDisplay'
import { HomeContextMenu } from '@/components/home/home-context-menu'
import { AppShell } from '@/components/home/layout/AppShell'
import { SearchBar } from '@/components/home/search/SearchBar'
import { PAGE_WIDGET_LEAVE_MS } from '@/components/home/widgets/PageWidgetSlot'
import { AsideWidgetBoard } from '@/components/home/widgets/aside-widget-board'
import { useLibrary } from '@/hooks/use-library'
import { useSharedPageWidgets } from '@/hooks/page-widgets-context'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { AsideWidgetId } from '@/constants/aside-widgets'
import { useAsideDock } from '@/hooks/use-aside-dock'
import { useAsidePair } from '@/hooks/use-aside-pair'
import { useAsideWidgetFlip } from '@/hooks/use-aside-widget-flip'
import { isFunctionsCategory, FUNCTION_FEATURE_APPS, getFunctionSiteApps } from '@/constants/rail-categories'
import type { FeatureTabId, GeocrmSearchTarget } from '@/constants/feature-tabs'
import type { AppItem, Category } from '@/types/library'
import { useSettingsRoles } from '@/hooks/use-settings-roles'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import { useHomeAppOrder } from '@/hooks/use-home-app-order'

type CategorySlide = 'up' | 'down'

const CATEGORY_TRANSITION_MS = 520

/**
 * Picks a category panel slide direction from tab order (vertical).
 * @param fromIndex - Current category index.
 * @param toIndex - Next category index.
 * @returns Slide direction for enter/exit animations.
 */
function resolveCategorySlide(fromIndex: number, toIndex: number): CategorySlide {
  const forward = !(fromIndex >= 0 && toIndex >= 0 && toIndex < fromIndex)
  return forward ? 'up' : 'down'
}

/**
 * Builds the CSS animation class for a category panel transition.
 * @param phase - Enter or exit phase.
 * @param slide - Slide direction.
 * @returns Animation class name.
 */
function categorySlideClass(phase: 'in' | 'out', slide: CategorySlide): string {
  return `animate-category-${phase}-${slide}`
}

interface ExitingCategoryPanel {
  categoryId: string
  items: AppItem[]
  name: string
  slide: CategorySlide
}

interface CategoryAppsSectionProps {
  userId: string
  categoryId: string
  categories: Category[]
  items: AppItem[]
  editing: boolean
  readOnly?: boolean
  /** Disables category title switching (exit overlay). */
  tabsDisabled?: boolean
  onSelectCategory: (categoryId: string) => void
  onEditingChange: (editing: boolean) => void
  onReorder: (itemIds: string[]) => void
  onCreate: (fields: {
    url: string
    name: string
  }) => Promise<void>
  onRemove: (appId: string) => Promise<void>
  onLinkExisting: (siteId: string) => Promise<void>
  onOpenFeature?: (feature: FeatureTabId) => void
  onOpenSettings?: () => void
}

/**
 * Renders one apps category panel (cycle title button + grid).
 * @param props - Category content and library actions.
 * @returns Category panel section.
 */
function CategoryAppsSection({
  userId,
  categoryId,
  categories,
  items,
  editing,
  readOnly = false,
  tabsDisabled = false,
  onSelectCategory,
  onEditingChange,
  onReorder,
  onCreate,
  onRemove,
  onLinkExisting,
  onOpenFeature,
  onOpenSettings,
}: CategoryAppsSectionProps) {
  const { t } = useTranslation()
  const roles = useSettingsRoles(userId)
  const desktopAccess = useDesktopModuleAccess(userId)
  const homeAppOrder = useHomeAppOrder(userId, FUNCTION_FEATURE_APPS)
  const canOpenTeOfficial = roles.isSystemAdmin || roles.isGroupAdmin
  const isFunctions = isFunctionsCategory(categoryId)
  const canEditLayout = !readOnly || isFunctions
  const functionSiteApps = getFunctionSiteApps()
  const visibleFunctionApps = homeAppOrder.items.filter((app) =>
    desktopAccess.isFunctionAppAllowed(app.id),
  )
  const appsCount = isFunctions
    ? visibleFunctionApps.length + functionSiteApps.length
    : items.length
  const activeCategory = categories.find((category) => category.id === categoryId) ?? categories[0]
  const activeLabel = activeCategory
    ? t(`categories.${activeCategory.id}`, { defaultValue: activeCategory.id })
    : ''

  /**
   * Cycles to the next category in library order (wraps around).
   * @returns void
   */
  function cycleCategory(): void {
    if (categories.length < 2 || !activeCategory) {
      return
    }
    const currentIndex = categories.findIndex((category) => category.id === activeCategory.id)
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % categories.length
    const nextCategory = categories[nextIndex]
    if (nextCategory) {
      onSelectCategory(nextCategory.id)
    }
  }

  return (
    <>
      <header className="mb-4 flex items-end justify-between gap-3">
        <button
          type="button"
          disabled={tabsDisabled || categories.length < 2}
          className="min-w-0 text-left text-xl font-extrabold tracking-tight text-brand transition hover:opacity-80 disabled:cursor-default disabled:opacity-40"
          onClick={cycleCategory}
        >
          {activeLabel}
        </button>
        <div className="relative h-8 min-w-24 shrink-0 overflow-hidden">
          <p
            className={`absolute inset-y-0 right-0 flex items-center text-xs font-medium text-muted transition duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              editing
                ? 'pointer-events-none -translate-y-full opacity-0'
                : 'translate-y-0 opacity-100'
            }`}
          >
            {t('status.appsCount', { count: appsCount })}
          </p>
          {canEditLayout ? (
            <button
              type="button"
              tabIndex={editing ? 0 : -1}
              className={`absolute inset-y-0 right-0 flex items-center rounded-full bg-brand px-4 text-xs font-bold text-brand-fg shadow-lg shadow-brand/25 transition duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-brand ${
                editing
                  ? 'translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-full opacity-0'
              }`}
              onClick={() => onEditingChange(false)}
            >
              {t('actions.done')}
            </button>
          ) : null}
        </div>
      </header>
      {isFunctions ? (
        <div className="space-y-4">
          <AppGrid
            userId={userId}
            categoryId={categoryId}
            items={visibleFunctionApps}
            editing={editing}
            readOnly={false}
            allowRemove={false}
            allowAdd={false}
            onEditingChange={onEditingChange}
            onReorder={homeAppOrder.reorder}
            onCreate={onCreate}
            onRemove={onRemove}
            onLinkExisting={onLinkExisting}
            onOpenFeature={onOpenFeature}
            onOpenSettings={onOpenSettings}
          />
          <div
            role="separator"
            className="mx-2 border-t border-zinc-950/10 sm:mx-4 dark:border-white/10"
          />
          <AppGrid
            userId={userId}
            categoryId={categoryId}
            items={functionSiteApps}
            editing={false}
            readOnly
            onEditingChange={() => undefined}
            onReorder={() => undefined}
            onCreate={onCreate}
            onRemove={onRemove}
            onLinkExisting={onLinkExisting}
            onOpenFeature={onOpenFeature}
            onOpenSettings={onOpenSettings}
            canOpenTeOfficial={canOpenTeOfficial}
          />
        </div>
      ) : (
        <AppGrid
          userId={userId}
          categoryId={categoryId}
          items={items}
          editing={editing}
          readOnly={readOnly}
          onEditingChange={onEditingChange}
          onReorder={onReorder}
          onCreate={onCreate}
          onRemove={onRemove}
          onLinkExisting={onLinkExisting}
          onOpenFeature={onOpenFeature}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  )
}

export interface HomePageProps {
  userId: string
  selectedCategoryId: string
  onSelectCategory: (categoryId: string) => void
  onOpenSettings: () => void
  onOpenFeature: (feature: FeatureTabId) => void
}

/**
 * Authenticated start / home page.
 * @param props - Signed-in user id and navigation.
 * @returns Home page.
 */
export function HomePage({
  userId,
  selectedCategoryId,
  onSelectCategory,
  onOpenSettings,
  onOpenFeature,
}: HomePageProps) {
  const { t } = useTranslation()
  const pageWidgets = useSharedPageWidgets()
  const { showWeather, showMarkets, showNews, showTodo, showCurrency, showSchedule, showMail, showApps, peekApps } =
    pageWidgets.widgets
  const asideVisibility: Record<AsideWidgetId, boolean> = {
    weather: showWeather,
    todo: showTodo,
    currency: showCurrency,
    markets: showMarkets,
    news: showNews,
    schedule: showSchedule,
    mail: showMail,
    focus: false,
  }
  const leftOrder = pageWidgets.asideRails.left
  const rightOrder = pageWidgets.asideRails.right
  const leftVisible = leftOrder.some((id) => asideVisibility[id])
  const rightVisible = rightOrder.some((id) => asideVisibility[id])
  const leftLeadId = leftOrder.find((id) => asideVisibility[id])
  const rightLeadId = rightOrder.find((id) => asideVisibility[id])
  const asideOrderKey = `${leftOrder.join('|')}::${rightOrder.join('|')}`
  const asideFlipRef = useAsideWidgetFlip(asideOrderKey)
  const showAsideDesired = leftVisible || rightVisible
  const asidePresence = useDialogPresence(showAsideDesired, PAGE_WIDGET_LEAVE_MS)
  const showAside = asidePresence.mounted
  const appsPanelVisible = showApps || peekApps
  const showMarketsNewsPair = showMarkets && showNews
  const asideDock = useAsideDock(showAside)
  const asidePair = useAsidePair(
    showMarketsNewsPair &&
      asideDock.layoutDock === 'stack' &&
      asideDock.motion.phase === 'idle',
  )

  /**
   * Resolves content-stage dock attribute for left / right / dual rails.
   * @returns Dock token for CSS grid.
   */
  function resolveAsideDockAttr(): 'stack' | 'left' | 'right' | 'dual' {
    if (!showAppsPanel || asideDock.layoutDock === 'stack') {
      return 'stack'
    }
    if (leftVisible && rightVisible) {
      return 'dual'
    }
    if (leftVisible) {
      return 'left'
    }
    if (rightVisible) {
      return 'right'
    }
    return 'stack'
  }

  /**
   * Admin shortcuts are removed from this Workbench shell.
   * @param _path - Absolute Admin path (ignored).
   * @returns Nothing.
   */
  function openAdminFromWidget(_path: string): void {
    return
  }
  const [categorySlide, setCategorySlide] = useState<CategorySlide | null>(null)
  const [exitingPanel, setExitingPanel] = useState<ExitingCategoryPanel | null>(null)
  const [editingApps, setEditingApps] = useState(false)
  const exitTimerRef = useRef<number | null>(null)
  const categoryStageRef = useRef<HTMLDivElement>(null)
  const library = useLibrary(userId, selectedCategoryId)
  const appsContentDesired = appsPanelVisible && !library.loading && !library.error
  const appsPanelPresence = useDialogPresence(appsContentDesired, PAGE_WIDGET_LEAVE_MS)
  const showAppsPanel = appsPanelPresence.mounted
  /** Clock + search only — vertically center so the lower half is not empty. */
  const heroOnly =
    !showAppsPanel &&
    !showAside &&
    !(appsPanelVisible && library.loading) &&
    !(appsPanelVisible && library.error)
  const categoryName = t(`categories.${selectedCategoryId}`, {
    defaultValue: selectedCategoryId,
  })

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current)
      }
    }
  }, [])

  /**
   * Switches the active category with a vertical exit/enter slide.
   * @param categoryId - Category to select.
   * @returns Nothing.
   */
  function selectCategory(categoryId: string): void {
    if (categoryId === selectedCategoryId) {
      return
    }
    if (isFunctionsCategory(categoryId)) {
      setEditingApps(false)
    }

    if (!showApps) {
      setEditingApps(false)
      onSelectCategory(categoryId)
      return
    }

    const fromIndex = library.categories.findIndex((category) => category.id === selectedCategoryId)
    const toIndex = library.categories.findIndex((category) => category.id === categoryId)
    const slide = resolveCategorySlide(fromIndex, toIndex)

    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current)
    }

    setExitingPanel({
      categoryId: selectedCategoryId,
      items: library.items,
      name: categoryName,
      slide,
    })
    setCategorySlide(slide)
    setEditingApps(false)
    onSelectCategory(categoryId)

    exitTimerRef.current = window.setTimeout(() => {
      setExitingPanel(null)
      exitTimerRef.current = null
    }, CATEGORY_TRANSITION_MS)
  }

  /**
   * Opens Settings or a Function tab from the home search bar.
   * @param target - Parsed geocrm:// target from SearchBar.
   * @returns Nothing.
   */
  function handleGeocrmTarget(target: GeocrmSearchTarget): void {
    if (target.kind === 'home') {
      return
    }
    if (target.kind === 'settings') {
      onOpenSettings()
      return
    }
    onOpenFeature(target.id)
  }

  return (
    <HomeContextMenu onOpenSettings={onOpenSettings}>
    <AppShell railDock="hidden">
      {heroOnly ? (
        <div className="flex min-h-[calc(100dvh-5.5rem)] items-center justify-center py-8">
          {/* Search bar is the vertical center; clock + date sit above it. */}
          <div className="relative z-30 w-full max-w-3xl">
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-5 flex flex-col items-center sm:mb-6">
              <DateTimeDisplay />
            </div>
            <div className="animate-enter enter-delay-3 relative w-full">
              <SearchBar userId={userId} onOpenGeocrmTarget={handleGeocrmTarget} />
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-10 sm:pt-12">
          <DateTimeDisplay />
          <div className="animate-enter enter-delay-3 relative z-30 mt-7 w-full sm:mt-9">
            <SearchBar userId={userId} onOpenGeocrmTarget={handleGeocrmTarget} />
          </div>
        </div>
      )}

      {appsPanelVisible && library.loading ? (
        <StatusLoading className="mt-16 min-h-40 flex-none" />
      ) : null}

      {appsPanelVisible && library.error ? (
        <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-center text-sm text-rose-500">
          {t('status.databaseError')}
        </div>
      ) : null}

      {showAppsPanel || showAside ? (
        <div
          ref={categoryStageRef}
          className="content-stage mt-12"
          data-aside-dock={resolveAsideDockAttr()}
        >
          <div ref={asideFlipRef} className="contents">
          {showAside && leftVisible ? (
            <aside
              data-stage-slot="left"
              className={
                asideDock.motion.phase === 'out' ||
                asideDock.motion.phase === 'in' ||
                asidePair.motion.phase === 'out' ||
                asidePair.motion.phase === 'in'
                  ? 'pointer-events-none'
                  : undefined
              }
            >
              <div className={asideDock.motionClass || undefined}>
                <div
                  className="content-stage-aside"
                  data-aside-pair="column"
                >
                  <AsideWidgetBoard
                    userId={userId}
                    order={leftOrder}
                    visibility={asideVisibility}
                    leadId={leftLeadId}
                    pair={false}
                    onOpenAdminPath={openAdminFromWidget}
                    onOpenMail={() => onOpenFeature('mail')}
                  />
                </div>
              </div>
            </aside>
          ) : null}

          {showAppsPanel ? (
            <div
              data-stage-slot="apps"
              className={`category-stage min-w-0 overflow-hidden ${
                appsPanelPresence.leaving
                  ? 'animate-page-widget-out pointer-events-none'
                  : !showApps
                    ? 'animate-page-widget-in'
                    : 'animate-enter'
              }`}
            >
              <div className="relative">
                {exitingPanel ? (
                  <section
                    className={`glass-panel pointer-events-none absolute inset-x-0 top-0 z-10 rounded-3xl p-5 ${categorySlideClass('out', exitingPanel.slide)}`}
                  >
                    <CategoryAppsSection
                      userId={userId}
                      categoryId={exitingPanel.categoryId}
                      categories={library.categories}
                      items={exitingPanel.items}
                      editing={false}
                      tabsDisabled
                      onSelectCategory={() => undefined}
                      onEditingChange={() => undefined}
                      onReorder={() => undefined}
                      onCreate={async () => undefined}
                      onRemove={async () => undefined}
                      onLinkExisting={async () => undefined}
                      onOpenFeature={onOpenFeature}
                      onOpenSettings={onOpenSettings}
                    />
                  </section>
                ) : null}

                <section
                  key={selectedCategoryId}
                  className={`glass-panel rounded-3xl p-5 ${
                    categorySlide ? categorySlideClass('in', categorySlide) : ''
                  }`}
                >
                  <CategoryAppsSection
                    userId={userId}
                    categoryId={selectedCategoryId}
                    categories={library.categories}
                    items={library.items}
                    editing={editingApps}
                    readOnly={isFunctionsCategory(selectedCategoryId)}
                    onSelectCategory={selectCategory}
                    onEditingChange={setEditingApps}
                    onReorder={library.reorderItems}
                    onCreate={library.createItem}
                    onRemove={library.removeItem}
                    onLinkExisting={library.linkItem}
                    onOpenFeature={onOpenFeature}
                    onOpenSettings={onOpenSettings}
                  />
                </section>
              </div>
            </div>
          ) : null}

          {showAside && rightVisible ? (
            <aside
              data-stage-slot="right"
              className={
                asideDock.motion.phase === 'out' ||
                asideDock.motion.phase === 'in' ||
                asidePair.motion.phase === 'out' ||
                asidePair.motion.phase === 'in'
                  ? 'pointer-events-none'
                  : undefined
              }
            >
              <div className={asideDock.motionClass || undefined}>
                <div
                  className={`content-stage-aside${
                    showMarketsNewsPair &&
                    asidePair.motionClass &&
                    resolveAsideDockAttr() === 'stack'
                      ? ` ${asidePair.motionClass}`
                      : ''
                  }`}
                  data-aside-pair={
                    !showAppsPanel ||
                    resolveAsideDockAttr() !== 'stack' ||
                    !showMarketsNewsPair
                      ? 'column'
                      : asidePair.layoutPair
                  }
                >
                  <AsideWidgetBoard
                    userId={userId}
                    order={rightOrder}
                    visibility={asideVisibility}
                    leadId={rightLeadId}
                    pair={
                      Boolean(showAppsPanel) &&
                      resolveAsideDockAttr() === 'stack' &&
                      showMarketsNewsPair &&
                      asidePair.layoutPair === 'pair'
                    }
                    onOpenAdminPath={openAdminFromWidget}
                    onOpenMail={() => onOpenFeature('mail')}
                  />
                </div>
              </div>
            </aside>
          ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
    </HomeContextMenu>
  )
}
