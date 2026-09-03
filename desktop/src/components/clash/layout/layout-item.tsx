import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { useCallback } from 'react'
import { useMatch, useNavigate, useResolvedPath } from 'react-router'

interface SortableProps {
  setNodeRef?: (element: HTMLElement | null) => void
  attributes?: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  style?: CSSProperties
  isDragging?: boolean
  disabled?: boolean
}

interface Props {
  to: string
  children: string
  icon: ReactNode
  expanded: boolean
  sortable?: SortableProps
}

/**
 * Clash sidebar row using Admin CRM rail chrome (icon + label, brand active).
 * @param props - Route, label, icon, expand state, and optional drag handle.
 * @returns Nav button.
 */
export const LayoutItem = (props: Props) => {
  const { to, children, icon, expanded, sortable } = props
  const resolved = useResolvedPath(to)
  const match = useMatch({ path: resolved.pathname, end: true })
  const navigate = useNavigate()
  const active = Boolean(match)

  const { setNodeRef, attributes, listeners, style, isDragging, disabled } =
    sortable ?? {}

  const draggable = Boolean(sortable) && !disabled
  const { onPointerDown, ...otherListeners } = draggable
    ? (listeners ?? {})
    : {}

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      onPointerDown?.(event)
    },
    [onPointerDown],
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-70' : undefined}
    >
      <button
        type="button"
        {...(draggable ? (attributes ?? {}) : {})}
        {...(draggable ? otherListeners : {})}
        title={expanded ? undefined : children}
        aria-label={expanded ? undefined : children}
        aria-current={active ? 'page' : undefined}
        className={[
          'flex min-h-8 w-full items-center text-left text-sm',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
          expanded && active
            ? 'rounded-lg bg-brand/10 pr-1 font-semibold text-brand'
            : expanded
              ? 'rounded-lg pr-1 font-medium text-ink hover:bg-ink/5'
              : 'text-ink',
        ].join(' ')}
        onPointerDown={handlePointerDown}
        onClick={() => navigate(to)}
      >
        <span
          className={[
            'relative box-border grid size-8 shrink-0 place-items-center border border-transparent',
            expanded
              ? ''
              : `rounded-md ${active ? 'bg-brand/10 text-brand' : 'hover:bg-ink/5'}`,
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={`min-w-0 truncate transition-[max-width,opacity,padding] duration-300 ease-out ${
            expanded
              ? 'flex-1 pr-2 pl-2 opacity-100'
              : 'pointer-events-none w-0 max-w-0 flex-none overflow-hidden pr-0 pl-0 opacity-0'
          }`}
          aria-hidden={!expanded}
        >
          {children}
        </span>
      </button>
    </div>
  )
}
