/**
 * NEXDOT CMS tab shell (homepage / footer / resources).
 */

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { NexdotCmsFooterPanel } from '@/components/admin/nexdot-cms-footer-panel'
import { NexdotCmsHomePanel } from '@/components/admin/nexdot-cms-home-panel'
import { NexdotCmsResourcesPanel } from '@/components/admin/nexdot-cms-resources-panel'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'

type CmsTab = 'home' | 'footer' | 'images' | 'documents' | 'blog'

const CMS_TAB_ORDER: CmsTab[] = [
  'home',
  'footer',
  'images',
  'documents',
  'blog',
]

/**
 * Horizontal slide class when switching CMS tabs (shell tab parity).
 * @param from - Previous tab.
 * @param to - Next tab.
 * @returns Animation class or empty.
 */
function cmsTabSlideClass(from: CmsTab | null, to: CmsTab): string {
  if (!from || from === to) {
    return ''
  }
  const fromIndex = CMS_TAB_ORDER.indexOf(from)
  const toIndex = CMS_TAB_ORDER.indexOf(to)
  if (fromIndex < 0 || toIndex < 0) {
    return ''
  }
  return toIndex > fromIndex ? 'animate-tab-page-forward' : 'animate-tab-page-back'
}

interface NexdotCmsPaneProps {
  writes: AdminShellWrites | null
}

/**
 * Storefront CMS for the NEXDOT Function (web AdminObmView parity).
 * @param props - Domain write grants.
 * @returns CMS UI.
 */
export function NexdotCmsPane({ writes }: NexdotCmsPaneProps): ReactNode {
  const { t } = useTranslation()
  const [tab, setTab] = useState<CmsTab>('home')
  const prevTabRef = useRef<CmsTab | null>(null)
  const tabSlide = cmsTabSlideClass(prevTabRef.current, tab)
  if (prevTabRef.current !== tab) {
    prevTabRef.current = tab
  }
  const canWriteAny = Boolean(
    writes?.canCreate || writes?.canEdit || writes?.canDelete,
  )

  const tabOptions = useMemo(
    () =>
      (
        [
          { value: 'home' as const, labelKey: 'admin.obm.tabs.home' },
          { value: 'footer' as const, labelKey: 'admin.obm.tabs.footer' },
          { value: 'images' as const, labelKey: 'admin.obm.tabs.images' },
          { value: 'documents' as const, labelKey: 'admin.obm.tabs.documents' },
          { value: 'blog' as const, labelKey: 'admin.obm.tabs.blog' },
        ] as const
      ).map((item) => ({ value: item.value, label: t(item.labelKey) })),
    [t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          {t('admin.obm.title')}
        </h2>
        <SlidingSegmented
          value={tab}
          options={tabOptions}
          ariaLabel={t('admin.obm.title')}
          className="w-full max-w-2xl sm:w-auto"
          onChange={setTab}
        />
      </div>

      {!canWriteAny ? (
        <p className="rounded-xl border border-ink/10 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-ink dark:bg-zinc-900">
          {t('admin.obm.readOnlyHint')}
        </p>
      ) : null}

      <div key={tab} className={tabSlide}>
        {tab === 'home' ? <NexdotCmsHomePanel writes={writes} /> : null}
        {tab === 'footer' ? <NexdotCmsFooterPanel writes={writes} /> : null}
        {tab === 'images' || tab === 'documents' || tab === 'blog' ? (
          <NexdotCmsResourcesPanel section={tab} writes={writes} />
        ) : null}
      </div>
    </div>
  )
}
