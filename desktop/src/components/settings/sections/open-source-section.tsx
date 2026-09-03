import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import npmNotices from '@/utils/settings/open-source-npm.json'
import {
  BUNDLED_OPEN_SOURCE_NOTICES,
  isBundledNpmNotice,
  type OpenSourceNpmNotice,
  type OpenSourceNotice,
} from '@/utils/settings/open-source-notices'
import { openExternalUrl } from '@/utils/shared/api'

const NPM_NOTICES = npmNotices as OpenSourceNpmNotice[]

/**
 * Opens a project homepage when present.
 * @param homepage - Absolute URL, or empty.
 * @returns Nothing.
 */
function openHomepage(homepage: string): void {
  if (!homepage) {
    return
  }
  void openExternalUrl(homepage)
}

/**
 * Whether a notice matches the search query.
 * @param haystack - Name, license, and optional extra text.
 * @param query - Lowercased query.
 * @returns True when the row should stay visible.
 */
function matchesQuery(haystack: string, query: string): boolean {
  if (!query) {
    return true
  }
  return haystack.toLowerCase().includes(query)
}

/**
 * Settings → Open Source Notices: bundled components plus npm production deps.
 * @returns Open-source notices UI.
 */
export function OpenSourceSection() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()

  const bundled = useMemo(
    () =>
      BUNDLED_OPEN_SOURCE_NOTICES.filter((notice) =>
        matchesQuery(`${notice.name} ${notice.license} ${notice.id}`, normalizedQuery),
      ),
    [normalizedQuery],
  )

  const npm = useMemo(
    () =>
      NPM_NOTICES.filter(
        (notice) =>
          !isBundledNpmNotice(notice.name) &&
          matchesQuery(`${notice.name} ${notice.license}`, normalizedQuery),
      ),
    [normalizedQuery],
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-brand">{t('settings.sections.openSource')}</p>
        <p className="text-sm leading-6 text-muted">{t('settings.openSource.intro')}</p>
      </div>

      <input
        type="search"
        className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none dark:border-white/10 dark:bg-zinc-950/40"
        placeholder={t('settings.openSource.searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {bundled.length === 0 && npm.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.openSource.emptySearch')}</p>
      ) : null}

      {bundled.length > 0 ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted">{t('settings.openSource.bundledHeading')}</p>
          <ul className="space-y-3">
            {bundled.map((notice) => (
              <BundledNoticeCard key={notice.id} notice={notice} />
            ))}
          </ul>
        </section>
      ) : null}

      {npm.length > 0 ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted">{t('settings.openSource.npmHeading')}</p>
          <ul className="divide-y divide-zinc-950/10 overflow-hidden rounded-2xl border border-zinc-950/10 bg-white/60 dark:divide-white/10 dark:border-white/10 dark:bg-zinc-950/40">
            {npm.map((notice) => (
              <li key={notice.name} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{notice.name}</p>
                  {notice.homepage ? (
                    <button
                      type="button"
                      className="mt-0.5 text-xs font-semibold text-brand underline-offset-2 hover:underline"
                      onClick={() => openHomepage(notice.homepage)}
                    >
                      {t('settings.openSource.homepage')}
                    </button>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs font-medium text-muted">
                  {t('settings.openSource.licenseLabel', { license: notice.license })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-5 text-muted">{t('settings.openSource.footnote')}</p>
    </div>
  )
}

interface BundledNoticeCardProps {
  notice: OpenSourceNotice
}

/**
 * One bundled-component notice card.
 * @param props - Notice record.
 * @returns Card.
 */
function BundledNoticeCard({ notice }: BundledNoticeCardProps) {
  const { t } = useTranslation()
  return (
    <li className="rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">{notice.name}</p>
        <p className="text-xs font-medium text-muted">
          {t('settings.openSource.licenseLabel', { license: notice.license })}
        </p>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted">{t(`settings.openSource.items.${notice.id}`)}</p>
      {notice.homepage ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-brand underline-offset-2 hover:underline"
          onClick={() => openHomepage(notice.homepage)}
        >
          {t('settings.openSource.homepage')}
        </button>
      ) : null}
    </li>
  )
}
