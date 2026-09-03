import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '@/icons/AllIcons'
import { useVerge } from '@/hooks/clash/use-verge'
import { parseHotkey } from '@/utils/clash/parse-hotkey'
import { ClashDialogShell, ClashPrimaryButton, ClashRow, ClashSecondaryButton, ClashSwitchRow } from './clash-ui'

const HOTKEY_FUNCTIONS = [
  'open_or_close_dashboard',
  'clash_mode_rule',
  'clash_mode_global',
  'clash_mode_direct',
  'toggle_system_proxy',
  'toggle_tun_mode',
  'entry_lightweight_mode',
  'reactivate_profiles',
] as const

type HotkeyFunction = (typeof HOTKEY_FUNCTIONS)[number]

function useHotkeyLabels(): Record<HotkeyFunction, string> {
  const { t } = useTranslation()
  return {
    open_or_close_dashboard: t('settings.clash.hotkeys.functions.openOrCloseDashboard'),
    clash_mode_rule: t('settings.clash.hotkeys.functions.rule'),
    clash_mode_global: t('settings.clash.hotkeys.functions.global'),
    clash_mode_direct: t('settings.clash.hotkeys.functions.direct'),
    toggle_system_proxy: t('settings.clash.hotkeys.functions.toggleSystemProxy'),
    toggle_tun_mode: t('settings.clash.hotkeys.functions.toggleTunMode'),
    entry_lightweight_mode: t('settings.clash.hotkeys.functions.entryLightweightMode'),
    reactivate_profiles: t('settings.clash.hotkeys.functions.reactivateProfiles'),
  }
}

function parseHotkeyMap(hotkeys: string[] | undefined): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  hotkeys?.forEach((text) => {
    const [func, key] = text.split(',').map((entry) => entry.trim())
    if (!func || !key) {
      return
    }
    map[func] = key.split('+').map((entry) => entry.trim()).map((entry) => (entry === 'PLUS' ? '+' : entry))
  })
  return map
}

/**
 * Hotkeys drill-in dialog: global hotkey toggle and per-function key capture.
 * @param props - Open state and close callback.
 * @returns Hotkeys dialog.
 */
export function HotkeysDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const labels = useHotkeyLabels()
  const { verge, patchVerge } = useVerge()

  const [hotkeyMap, setHotkeyMap] = useState<Record<string, string[]>>({})
  const [enableGlobalHotkey, setEnableGlobalHotkey] = useState(verge?.enable_global_hotkey ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setHotkeyMap(parseHotkeyMap(verge?.hotkeys))
    setEnableGlobalHotkey(verge?.enable_global_hotkey ?? true)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    const hotkeys = Object.entries(hotkeyMap)
      .map(([func, keys]) => {
        if (!func || !keys?.length) {
          return ''
        }
        const key = keys
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => (entry === '+' ? 'PLUS' : entry))
          .join('+')
        return key ? `${func},${key}` : ''
      })
      .filter(Boolean)

    setSaving(true)
    setError(null)
    try {
      await patchVerge({ hotkeys, enable_global_hotkey: enableGlobalHotkey })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.hotkeys.title')}
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      <ClashSwitchRow
        label={t('settings.clash.hotkeys.toggles.enableGlobal')}
        checked={enableGlobalHotkey}
        disabled={saving}
        onChange={setEnableGlobalHotkey}
      />

      {HOTKEY_FUNCTIONS.map((func) => (
        <ClashRow key={func} label={labels[func]}>
          <HotkeyCapture
            value={hotkeyMap[func] ?? []}
            disabled={saving}
            onChange={(keys) => setHotkeyMap((current) => ({ ...current, [func]: keys }))}
          />
        </ClashRow>
      ))}

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}

/** Captures a chord of keys via a hidden focusable input, mirroring Clash's hotkey capture UX. */
function HotkeyCapture({
  value,
  disabled,
  onChange,
}: {
  value: string[]
  disabled?: boolean
  onChange: (value: string[]) => void
}) {
  const { t } = useTranslation()
  const captureRef = useRef<string[]>([])
  const [keys, setKeys] = useState(value)

  useEffect(() => {
    setKeys(value)
  }, [value])

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative min-h-9 w-40">
        <input
          disabled={disabled}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onKeyUp={() => {
            const captured = captureRef.current.slice()
            if (captured.length) {
              onChange(captured)
              captureRef.current = []
            }
          }}
          onKeyDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const key = parseHotkey(event)
            if (key === 'UNIDENTIFIED') {
              return
            }
            captureRef.current = [...new Set([...captureRef.current, key])]
            setKeys(captureRef.current)
          }}
        />
        <div className="flex h-full min-h-9 w-full flex-wrap items-center gap-1 rounded-xl border border-zinc-950/10 px-2 py-1 dark:border-white/10">
          {keys.map((key, index) => (
            <span key={`${key}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span className="text-xs text-muted">+</span> : null}
              <span className="rounded border border-zinc-950/15 px-1.5 py-0.5 text-xs text-ink dark:border-white/15">
                {key}
              </span>
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        title={t('actions.remove')}
        className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
        onClick={() => {
          onChange([])
          setKeys([])
        }}
      >
        <TrashIcon className="size-3.5" />
      </button>
    </div>
  )
}
