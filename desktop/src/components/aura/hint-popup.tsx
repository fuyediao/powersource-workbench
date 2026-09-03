import { useEffect, useRef, useState } from 'react'
import {
  commitHintValue,
  getHintState,
  subscribeHint,
  type HintState,
} from '@/hooks/aura/hint-store'
import {
  getEditorChromeDark,
  subscribeEditorChromeDark,
} from '@/hooks/aura/editor-chrome-theme-store'

const hintRootClass = [
  'aura fixed z-[4] m-0 max-w-[250px] min-w-20 list-none rounded-[3px]',
  'bg-(--panel-background-color) px-0 py-[5px] text-xs leading-5',
  'shadow-(--panel-shadow)',
].join(' ')

const hintButtonClass = [
  'm-0 box-border block w-full cursor-pointer overflow-hidden text-ellipsis',
  'whitespace-nowrap rounded-none border-0 bg-transparent px-2.5 py-[3px]',
  'text-left leading-5 text-(--overlay-icon-color) outline-none',
  'hover:bg-(--overlay-bg-color) hover:text-(--overlay-icon-hover-color)',
  '[&_img]:float-left [&_img]:mr-[3px] [&_img]:size-5',
].join(' ')

const hintButtonCurrentClass = [
  hintButtonClass,
  'bg-(--overlay-bg-color) text-(--overlay-icon-hover-color)',
].join(' ')

/**
 * Autocomplete popup for emoji / language hints (React-owned chrome).
 *
 * @returns Hint list element, or null when hidden.
 */
export function HintPopup() {
  const [hint, setHint] = useState<HintState>(() => getHintState())
  const [dark, setDark] = useState(getEditorChromeDark)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => subscribeHint(() => setHint(getHintState())), [])
  useEffect(
    () => subscribeEditorChromeDark(() => setDark(getEditorChromeDark())),
    [],
  )

  useEffect(() => {
    const el = rootRef.current
    if (!el || !hint.visible) {
      return
    }
    // Flip above the caret when the list would overflow the viewport.
    if (el.getBoundingClientRect().bottom > window.innerHeight) {
      el.style.top = `${hint.top - el.offsetHeight}px`
    }
  }, [hint])

  if (!hint.visible || hint.items.length === 0) {
    return null
  }

  return (
    <div
      ref={rootRef}
      className={`${hintRootClass}${dark ? ' aura--dark' : ''}`}
      style={{
        display: 'block',
        left: hint.right === 'auto' ? hint.left : undefined,
        right: hint.right === 'auto' ? undefined : hint.right,
        top: hint.top,
      }}
      role="listbox"
    >
      {hint.items.map((item, index) => (
        <button
          key={`${item.value}-${index}`}
          type="button"
          role="option"
          aria-selected={index === hint.selectedIndex}
          className={
            index === hint.selectedIndex
              ? hintButtonCurrentClass
              : hintButtonClass
          }
          dangerouslySetInnerHTML={{ __html: item.html }}
          onMouseDown={(event) => {
            event.preventDefault()
            commitHintValue(item.value)
          }}
        />
      ))}
    </div>
  )
}
