import { useTranslation } from 'react-i18next'
import { NewsIcon } from '@/icons/AllIcons'
import { useAnimatedHeight } from '@/hooks/use-animated-height'
import { useLinkOpen } from '@/hooks/link-open-context'
import { useNews } from '@/hooks/use-news'

/**
 * Renders the editorial briefing widget from a live RSS feed.
 * @returns News briefing widget.
 */
export function NewsCard() {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const { item, loading } = useNews()
  const { shellRef, contentRef } = useAnimatedHeight([item?.title, item?.description, loading])

  return (
    <section
      ref={shellRef}
      className="glass-panel overflow-hidden rounded-3xl will-change-[height]"
    >
      <div ref={contentRef} className="p-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-brand">{t('news.title')}</h2>
            <p className="mt-1 text-xs text-muted">{t('news.subtitle')}</p>
          </div>
          <span className="grid size-9 place-items-center rounded-xl bg-brand/15 text-brand">
            <NewsIcon className="size-5" />
          </span>
        </header>

        {item ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => {
              openUrl(item.url)
            }}
          >
            <h3 className="text-sm font-bold leading-snug text-brand">{item.title}</h3>
            {item.description ? (
              <p className="mt-2 text-xs leading-relaxed text-muted">{item.description}</p>
            ) : null}
          </button>
        ) : (
          <p className={`text-xs text-muted ${loading ? 'opacity-60' : ''}`}>
            {loading ? t('status.loading') : t('news.unavailable')}
          </p>
        )}
      </div>
    </section>
  )
}
