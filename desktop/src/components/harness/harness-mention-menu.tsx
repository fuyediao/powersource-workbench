/**
 * `@` plugin picker for the Harness composer.
 */

import { useTranslation } from 'react-i18next'
import { HarnessIcon } from '@/icons/AllIcons'
import type { ComposerMentionOption } from '@/utils/harness/composer-mentions'

interface HarnessMentionMenuProps {
  items: ComposerMentionOption[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onPick: (item: ComposerMentionOption) => void
  onManage: () => void
  onConnect: (name: string) => void
}

/**
 * Renders the ChatGPT-style plugin list opened by `@`.
 * @param props - Filtered rows and selection handlers.
 * @returns Mention menu element.
 */
export function HarnessMentionMenu({
  items,
  activeIndex,
  onActiveIndexChange,
  onPick,
  onManage,
  onConnect,
}: HarnessMentionMenuProps) {
  const { t } = useTranslation()
  return (
    <div
      className="absolute bottom-full left-0 z-40 mb-2 w-full overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      data-testid="harness-mention-menu"
    >
      <p className="px-2 py-1 text-[11px] font-bold tracking-wide text-muted uppercase">
        {t('harness.composer.menu.plugins')}
      </p>
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted">{t('harness.composer.mentionEmpty')}</p>
        ) : (
          items.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${
                index === activeIndex ? 'bg-zinc-950/5 dark:bg-white/5' : ''
              }`}
              onMouseEnter={() => onActiveIndexChange(index)}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(item)}
              >
                <HarnessIcon
                  className={`size-4 shrink-0 ${item.callable ? 'text-emerald-500' : 'text-muted'}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                  {item.name}
                </span>
              </button>
              {item.kind === 'mcp' && item.needsOauth ? (
                <button
                  type="button"
                  className="rounded-lg bg-brand/10 px-2 py-1 text-[10px] font-bold text-brand hover:bg-brand/15"
                  onClick={() => onConnect(item.mcpLoginName ?? item.name)}
                >
                  {t('harness.composer.menu.connect')}
                </button>
              ) : (
                <span
                  className={`text-[10px] font-semibold ${item.callable ? 'text-emerald-600' : 'text-muted'}`}
                >
                  {item.callable
                    ? t('harness.library.mcp.callable')
                    : t('harness.library.mcp.oauthRequired')}
                </span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-zinc-950/10 px-2 pt-2 dark:border-white/10">
        <p className="text-[11px] text-muted">{t('harness.composer.mentionHint')}</p>
        <button
          type="button"
          className="text-[11px] font-bold text-brand hover:underline"
          onClick={onManage}
        >
          {t('harness.composer.menu.manage')}
        </button>
      </div>
    </div>
  )
}
