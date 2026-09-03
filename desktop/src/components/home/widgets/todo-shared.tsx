import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { CheckIcon, CloseIcon } from '@/icons/AllIcons'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import type { TodoItemDto } from '@/utils/home/library-api'

/** Max todos shown on the aside card; widget tools lists all. */
export const TODO_CARD_VISIBLE_LIMIT = 10

const TODO_REORDER_MS = 300
const TODO_REORDER_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

interface TodoComposeFieldProps {
  placeholder: string
  disabled?: boolean
  className?: string
  onSubmitText: (text: string) => Promise<void>
}

interface TodoListItemsProps {
  items: TodoItemDto[]
  onToggle: (id: string, done: boolean) => void
  onRemove: (id: string) => void
}

/**
 * Enter-to-add todo field with IME-safe composition handling.
 * @param props - Placeholder, submit handler, and optional disabled state.
 * @returns Compose form.
 */
export function TodoComposeField({
  placeholder,
  disabled = false,
  className,
  onSubmitText,
}: TodoComposeFieldProps) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const isComposingRef = useRef(false)

  /**
   * Submits the draft when non-empty and not composing.
   * @returns Nothing.
   */
  async function submitDraft(): Promise<void> {
    const text = draft.trim()
    if (!text || saving || disabled || isComposingRef.current) {
      return
    }
    setSaving(true)
    try {
      await onSubmitText(text)
      setDraft('')
    } catch {
      // Keep the draft so the user can retry.
    } finally {
      setSaving(false)
    }
  }

  /**
   * Handles form submit from Enter in a single-field form.
   * @param event - Form event.
   * @returns Nothing.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void submitDraft()
  }

  /**
   * Submits on Enter; leaves IME composition Enter alone.
   * @param event - Keyboard event.
   * @returns Nothing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (event.key !== 'Enter') {
      return
    }
    event.preventDefault()
    void submitDraft()
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <FocusRingFrame className="w-full" shellClassName={FOCUS_RING_SHELL}>
        <input
          type="text"
          enterKeyHint="done"
          autoComplete="off"
          value={draft}
          disabled={saving || disabled}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={120}
          className="w-full bg-transparent px-3 py-2 text-sm font-semibold text-brand outline-none placeholder:text-zinc-400 disabled:opacity-60"
        />
      </FocusRingFrame>
    </form>
  )
}

/**
 * Renders todo rows with complete / delete controls and FLIP reorder motion.
 * FLIP only runs when the id order changes (not on every parent re-render).
 * @param props - Items and mutation handlers.
 * @returns List element or null when empty.
 */
export function TodoListItems({ items, onToggle, onRemove }: TodoListItemsProps) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const positionsRef = useRef(new Map<string, number>())
  const itemsRef = useRef(items)
  const prevOrderKeyRef = useRef('')
  const orderKey = items.map((item) => item.id).join('|')
  itemsRef.current = items

  useLayoutEffect(() => {
    const list = itemsRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const prevOrderKey = prevOrderKeyRef.current
    prevOrderKeyRef.current = orderKey
    const shouldAnimate =
      !reduceMotion &&
      prevOrderKey.length > 0 &&
      orderKey.length > 0 &&
      prevOrderKey !== orderKey

    const previous = positionsRef.current
    const next = new Map<string, number>()

    for (const item of list) {
      const node = itemRefs.current.get(item.id)
      if (!node) {
        continue
      }
      const top = node.getBoundingClientRect().top
      next.set(item.id, top)
      if (!shouldAnimate) {
        continue
      }
      const firstTop = previous.get(item.id)
      if (firstTop === undefined) {
        continue
      }
      const dy = firstTop - top
      if (Math.abs(dy) < 1) {
        continue
      }
      node.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }],
        { duration: TODO_REORDER_MS, easing: TODO_REORDER_EASE },
      )
    }

    positionsRef.current = next

    // After first populate, refresh baselines once entrance motion settles.
    if (prevOrderKey.length === 0 && orderKey.length > 0) {
      const settleId = window.setTimeout(() => {
        const fresh = new Map<string, number>()
        for (const item of itemsRef.current) {
          const node = itemRefs.current.get(item.id)
          if (node) {
            fresh.set(item.id, node.getBoundingClientRect().top)
          }
        }
        positionsRef.current = fresh
      }, 420)
      return () => window.clearTimeout(settleId)
    }

    return undefined
  }, [orderKey])

  if (items.length === 0) {
    return null
  }

  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          ref={(node) => {
            if (node) {
              itemRefs.current.set(item.id, node)
            } else {
              itemRefs.current.delete(item.id)
            }
          }}
          className="group flex items-center gap-2 rounded-xl px-1 py-1.5 transition-[background-color] hover:bg-zinc-950/5 dark:hover:bg-white/5"
        >
          <button
            type="button"
            className={`grid size-6 shrink-0 place-items-center rounded-lg border transition ${
              item.done
                ? 'border-brand bg-brand text-brand-fg'
                : 'border-zinc-950/15 text-transparent hover:border-brand/50 dark:border-white/20'
            }`}
            onClick={() => onToggle(item.id, !item.done)}
          >
            <CheckIcon className="size-3.5" />
          </button>
          <span
            className={`min-w-0 flex-1 text-sm leading-snug transition-[color,text-decoration-color] duration-300 ${
              item.done
                ? 'text-muted line-through decoration-brand'
                : 'text-brand'
            }`}
          >
            {item.text}
          </span>
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-lg text-muted opacity-0 transition group-hover:opacity-100 hover:bg-brand/15 hover:text-brand focus-visible:opacity-100"
            onClick={() => onRemove(item.id)}
          >
            <CloseIcon className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}
