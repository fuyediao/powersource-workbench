import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLinkIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import { useClashInfo } from '@/hooks/clash/use-clash'
import { useVerge } from '@/hooks/clash/use-verge'
import { openWebUrl } from '@/services/clash/cmds'
import { ClashDialogShell, ClashSecondaryButton, ClashTextInput } from './clash-ui'

const DEFAULT_WEB_UI_LIST = [
  'https://metacubex.github.io/metacubexd/#/setup?http=true&hostname=%host&port=%port&secret=%secret',
  'https://yacd.metacubex.one/?hostname=%host&port=%port&secret=%secret',
  'https://board.zash.run.place/#/setup?http=true&hostname=%host&port=%port&secret=%secret',
]

/**
 * Web UI drill-in dialog: manage the list of external dashboard URLs.
 * @param props - Open state and close callback.
 * @returns Web UI dialog.
 */
export function WebUIDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { clashInfo } = useClashInfo()
  const { verge, patchVerge, mutateVerge } = useVerge()
  const [error, setError] = useState<string | null>(null)

  const webUIList = verge?.web_ui_list ?? DEFAULT_WEB_UI_LIST

  async function persist(newList: string[]): Promise<void> {
    mutateVerge((old) => (old ? { ...old, web_ui_list: newList } : old), false)
    await patchVerge({ web_ui_list: newList })
  }

  async function handleOpenUrl(value: string): Promise<void> {
    setError(null)
    try {
      let url = value.trim().replaceAll('%host', '127.0.0.1')
      if (url.includes('%port') || url.includes('%secret')) {
        if (!clashInfo?.server?.includes(':')) {
          throw new Error(t('settings.clash.webUi.errors.invalidServer'))
        }
        const port = clashInfo.server.slice(clashInfo.server.indexOf(':') + 1).trim()
        url = url.replaceAll('%port', port || '9097')
        url = url.replaceAll('%secret', encodeURIComponent(clashInfo.secret || ''))
      }
      await openWebUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.webUi.title')}
      headerExtra={
        <ClashSecondaryButton onClick={() => void persist([...webUIList, ''])}>
          <span className="flex items-center gap-1.5">
            <PlusIcon className="size-3.5" />
            {t('settings.clash.webUi.actions.add')}
          </span>
        </ClashSecondaryButton>
      }
      footer={<ClashSecondaryButton onClick={onClose}>{t('actions.close')}</ClashSecondaryButton>}
    >
      {webUIList.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('settings.clash.webUi.empty')}</p>
      ) : (
        <div className="space-y-2">
          {webUIList.map((item, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <ClashTextInput
                value={item}
                placeholder={t('settings.clash.webUi.placeholder')}
                onChange={(value) => {
                  const next = [...webUIList]
                  next[index] = value
                  void persist(next)
                }}
                className="flex-1"
              />
              <button
                type="button"
                disabled={!item.trim()}
                className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
                title={t('settings.clash.webUi.actions.open')}
                onClick={() => void handleOpenUrl(item)}
              >
                <ExternalLinkIcon className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-full p-1.5 text-red-500 transition hover:bg-red-500/10"
                title={t('actions.remove')}
                onClick={() => {
                  const next = [...webUIList]
                  next.splice(index, 1)
                  void persist(next)
                }}
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
