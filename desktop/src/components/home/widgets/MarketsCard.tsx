import { useTranslation } from 'react-i18next'
import { TrendIcon } from '@/icons/AllIcons'
import { useAnimatedHeight } from '@/hooks/use-animated-height'
import { useWidgetTools } from '@/hooks/use-widget-tools'

/**
 * Renders a compact market summary widget.
 * @returns Market widget.
 */
export function MarketsCard() {
  const { t } = useTranslation()
  const { quotes, marketsLoading } = useWidgetTools()
  const quoteKey = quotes.map((quote) => quote.id).join('|')
  const { shellRef, contentRef } = useAnimatedHeight([quoteKey, marketsLoading])

  return (
    <section
      ref={shellRef}
      className="glass-panel overflow-hidden rounded-3xl will-change-[height]"
    >
      <div ref={contentRef} className="p-5">
        <header className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-brand">{t('markets.title')}</h2>
            <p className="mt-1 text-xs text-muted">{t('markets.subtitle')}</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <TrendIcon className="size-5" />
          </span>
        </header>
        <div className={`space-y-3 transition ${marketsLoading ? 'opacity-60' : ''}`}>
          {quotes.length > 0 ? (
            quotes.map((quote) => (
              <div key={quote.id} className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted">{quote.symbol}</p>
                  <p className="mt-1 text-lg font-bold text-brand tabular-nums">
                    ${quote.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold ${quote.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {quote.change >= 0 ? '+' : ''}
                  {quote.change.toFixed(1)}%
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted">{t('markets.emptySelection')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
