import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListOrderedIcon,
  ListUnorderedIcon,
  QuoteIcon,
  SmileIcon,
  StrikeIcon,
  UnderlineIcon,
} from '@/icons/AllIcons'

const FONT_FACES: { label: string; value: string }[] = [
  { label: 'Sans Serif', value: 'Arial' },
  { label: 'Serif', value: 'Times New Roman' },
  { label: 'Fixed Width', value: 'Courier New' },
  { label: 'Comic Sans MS', value: 'Comic Sans MS' },
  { label: 'Garamond', value: 'Garamond' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Tahoma', value: 'Tahoma' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS' },
  { label: 'Verdana', value: 'Verdana' },
]

const FONT_SIZES: { labelKey: string; value: string }[] = [
  { labelKey: 'mail.format.sizeSmall', value: '1' },
  { labelKey: 'mail.format.sizeNormal', value: '2' },
  { labelKey: 'mail.format.sizeLarge', value: '4' },
  { labelKey: 'mail.format.sizeHuge', value: '6' },
]

const TEXT_COLORS = [
  '#000000',
  '#434343',
  '#666666',
  '#999999',
  '#cccccc',
  '#ffffff',
  '#980000',
  '#ff0000',
  '#ff9900',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#4a86e8',
  '#0000ff',
  '#9900ff',
  '#ff00ff',
]

const EMOJIS = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '😂',
  '🤣',
  '😊',
  '😇',
  '🙂',
  '😉',
  '😍',
  '😘',
  '😜',
  '🤔',
  '😎',
  '😢',
  '😭',
  '😡',
  '👍',
  '👎',
  '👏',
  '🙏',
  '🎉',
  '🔥',
  '❤️',
  '✨',
  '✅',
  '❌',
  '📌',
  '📎',
]

interface FormatState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

export interface MailComposerEditorHandle {
  insertHtml: (html: string) => void
}

interface MailComposerEditorProps {
  html: string
  placeholder: string
  onChange: (html: string) => void
}

/**
 * Runs a document formatting command on the focused composer.
 * @param command - execCommand name.
 * @param value - Optional command value.
 */
function runFormat(command: string, value?: string): void {
  document.execCommand(command, false, value)
}

/**
 * Reads toggle state from the current selection.
 * @returns Active format flags.
 */
function readFormatState(): FormatState {
  try {
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
    }
  } catch {
    return { bold: false, italic: false, underline: false, strike: false }
  }
}

/**
 * One toolbar icon button.
 * @param props - Label, active flag, and click handler.
 * @returns Button.
 */
function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`grid size-7 shrink-0 place-items-center rounded text-muted hover:bg-mail-row-hover hover:text-ink ${
        active ? 'text-brand' : ''
      }`}
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

/**
 * Mailspring-style rich composer: contenteditable body with the format toolbar below it.
 * @param props - HTML draft value and change handler.
 * @param ref - Optional insertHtml handle for attachments.
 * @returns Editor and toolbar.
 */
export const MailComposerEditor = forwardRef<MailComposerEditorHandle, MailComposerEditorProps>(
  function MailComposerEditor({ html, placeholder, onChange }, ref): ReactNode {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const lastHtml = useRef(html)
  const [format, setFormat] = useState<FormatState>({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
  })
  const [colorOpen, setColorOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('https://')
  const colorPresence = useDialogPresence(colorOpen, 160)
  const linkPresence = useDialogPresence(linkOpen, 160)
  const emojiPresence = useDialogPresence(emojiOpen, 160)

  const syncHtml = useCallback((): void => {
    const next = editorRef.current?.innerHTML ?? ''
    lastHtml.current = next
    onChange(next)
    setFormat(readFormatState())
  }, [onChange])

  const apply = useCallback(
    (command: string, value?: string): void => {
      editorRef.current?.focus()
      runFormat(command, value)
      syncHtml()
    },
    [syncHtml],
  )

  useImperativeHandle(ref, () => ({
    insertHtml(nextHtml: string): void {
      editorRef.current?.focus()
      document.execCommand('insertHTML', false, nextHtml)
      syncHtml()
    },
  }))

  useEffect(() => {
    if (!editorRef.current) {
      return
    }
    if (html !== lastHtml.current && html !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = html
      lastHtml.current = html
    }
  }, [html])

  useEffect(() => {
    /**
     * Refresh toolbar toggles when the caret moves.
     */
    function onSelectionChange(): void {
      if (!editorRef.current?.contains(document.activeElement) && document.activeElement !== editorRef.current) {
        const selection = document.getSelection()
        if (!selection || selection.rangeCount === 0) {
          return
        }
        const node = selection.anchorNode
        if (!node || !editorRef.current?.contains(node)) {
          return
        }
      }
      setFormat(readFormatState())
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  const empty = html.trim() === '' || html === '<br>' || html === '<div><br></div>'

  /**
   * Upward dropdown animation for popovers above the bottom toolbar.
   * @param leaving - Whether the popover is closing.
   * @param open - Whether the popover is open.
   * @returns Animation class name.
   */
  function popoverMotion(leaving: boolean, open: boolean): string {
    return leaving || !open ? 'animate-dropdown-out-up' : 'animate-dropdown-in-up'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={t('mail.bodyTitle')}
        contentEditable
        data-placeholder={placeholder}
        data-empty={empty ? 'true' : 'false'}
        className="mail-composer-editor min-h-[120px] flex-1 overflow-y-auto px-[22px] py-3 text-[13px] leading-relaxed text-ink outline-none"
        onInput={syncHtml}
        onBlur={syncHtml}
      />
      <div className="mail-composer-toolbar relative flex shrink-0 flex-wrap items-center">
        <ToolbarButton label={t('mail.format.bold')} active={format.bold} onClick={() => apply('bold')}>
          <BoldIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t('mail.format.italic')} active={format.italic} onClick={() => apply('italic')}>
          <ItalicIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label={t('mail.format.underline')}
          active={format.underline}
          onClick={() => apply('underline')}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t('mail.format.strike')} active={format.strike} onClick={() => apply('strikeThrough')}>
          <StrikeIcon className="size-3.5" />
        </ToolbarButton>
        <span className="mail-composer-toolbar-divider" aria-hidden />
        <div className="relative">
          <ToolbarButton
            label={t('mail.format.color')}
            onClick={() => {
              setLinkOpen(false)
              setEmojiOpen(false)
              setColorOpen((open) => !open)
            }}
          >
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[11px] leading-none font-bold">A</span>
              <span className="h-0.5 w-3.5 rounded-full bg-brand" />
            </span>
          </ToolbarButton>
          {colorPresence.mounted ? (
            <div
              className={`absolute bottom-full left-0 z-20 mb-1 grid w-40 grid-cols-8 gap-1 rounded-lg border border-mail-divider bg-mail-menu p-2 shadow-xl ${popoverMotion(
                colorPresence.leaving,
                colorOpen,
              )}`}
            >
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  className="size-4 rounded-sm border border-mail-divider"
                  style={{ backgroundColor: color }}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    apply('foreColor', color)
                    setColorOpen(false)
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <label className="sr-only" htmlFor="mail-composer-font-face">
          {t('mail.format.font')}
        </label>
        <select
          id="mail-composer-font-face"
          className="h-7 max-w-28 shrink-0 border-0 bg-transparent px-1 text-[12px] text-ink outline-none"
          defaultValue="Arial"
          onMouseDown={() => editorRef.current?.focus()}
          onChange={(event) => apply('fontName', event.target.value)}
        >
          {FONT_FACES.map((face) => (
            <option key={face.value} value={face.value}>
              {face.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="mail-composer-font-size">
          {t('mail.format.size')}
        </label>
        <select
          id="mail-composer-font-size"
          className="h-7 max-w-24 shrink-0 border-0 bg-transparent px-1 text-[12px] text-ink outline-none"
          defaultValue="2"
          onMouseDown={() => editorRef.current?.focus()}
          onChange={(event) => apply('fontSize', event.target.value)}
        >
          {FONT_SIZES.map((size) => (
            <option key={size.value} value={size.value}>
              {t(size.labelKey)}
            </option>
          ))}
        </select>
        <span className="mail-composer-toolbar-divider" aria-hidden />
        <ToolbarButton label={t('mail.format.numberedList')} onClick={() => apply('insertOrderedList')}>
          <ListOrderedIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t('mail.format.bulletedList')} onClick={() => apply('insertUnorderedList')}>
          <ListUnorderedIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label={t('mail.format.quote')} onClick={() => apply('formatBlock', 'blockquote')}>
          <QuoteIcon className="size-3.5" />
        </ToolbarButton>
        <span className="mail-composer-toolbar-divider" aria-hidden />
        <div className="relative">
          <ToolbarButton
            label={t('mail.format.link')}
            onClick={() => {
              setColorOpen(false)
              setEmojiOpen(false)
              setLinkOpen((open) => !open)
            }}
          >
            <LinkIcon className="size-3.5" />
          </ToolbarButton>
          {linkPresence.mounted ? (
            <div
              className={`absolute bottom-full left-0 z-20 mb-1 flex w-64 items-center gap-1 rounded-lg border border-mail-divider bg-mail-menu p-2 shadow-xl ${popoverMotion(
                linkPresence.leaving,
                linkOpen,
              )}`}
            >
              <input
                type="url"
                value={linkValue}
                placeholder={t('mail.format.linkPlaceholder')}
                className="mail-onboard-input min-w-0 flex-1 !rounded-md !py-1 text-[12px]"
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    apply('createLink', linkValue.trim())
                    setLinkOpen(false)
                  }
                }}
              />
              <button
                type="button"
                className="rounded-md bg-brand px-2 py-1 text-[12px] font-semibold text-brand-fg"
                onMouseDown={(event) => {
                  event.preventDefault()
                  apply('createLink', linkValue.trim())
                  setLinkOpen(false)
                }}
              >
                {t('mail.format.linkApply')}
              </button>
            </div>
          ) : null}
        </div>
        <div className="relative">
          <ToolbarButton
            label={t('mail.format.emoji')}
            onClick={() => {
              setColorOpen(false)
              setLinkOpen(false)
              setEmojiOpen((open) => !open)
            }}
          >
            <SmileIcon className="size-3.5" />
          </ToolbarButton>
          {emojiPresence.mounted ? (
            <div
              className={`absolute right-0 bottom-full z-20 mb-1 grid w-56 grid-cols-8 gap-0.5 rounded-lg border border-mail-divider bg-mail-menu p-2 shadow-xl ${popoverMotion(
                emojiPresence.leaving,
                emojiOpen,
              )}`}
            >
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="grid size-6 place-items-center rounded text-sm hover:bg-mail-row-hover"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    apply('insertText', emoji)
                    setEmojiOpen(false)
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})
