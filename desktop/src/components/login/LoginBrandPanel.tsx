import { MapExplorerIcon } from '@/icons/AllIcons'
import { LoginCharacters } from '@/components/login/LoginCharacters'

interface LoginBrandPanelProps {
  isTyping: boolean
  password: string
  showPassword: boolean
}

/**
 * Left brand column for the desktop login shell (mirrors workbench-web LoginCharactersPanel).
 * @param props - Form interaction flags that drive character animation.
 * @returns Brand panel with animated mascots.
 */
export function LoginBrandPanel({
  isTyping,
  password,
  showPassword,
}: LoginBrandPanelProps) {
  return (
    <aside className="relative hidden h-full min-h-0 flex-col justify-between overflow-hidden bg-linear-to-br from-brand via-brand to-brand/85 p-12 text-brand-fg lg:flex">
      <div className="relative z-20">
        <div className="flex items-center gap-2 text-lg font-semibold text-brand-fg">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white dark:bg-zinc-950">
            <MapExplorerIcon className="size-7" />
          </div>
          <span>PowerSource Workbench</span>
        </div>
      </div>

      <LoginCharacters
        isTyping={isTyping}
        password={password}
        showPassword={showPassword}
      />

      <div className="relative z-20" aria-hidden />

      <div className="pointer-events-none absolute top-1/4 right-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-1/4 left-1/4 size-96 rounded-full bg-white/5 blur-3xl" />
    </aside>
  )
}
