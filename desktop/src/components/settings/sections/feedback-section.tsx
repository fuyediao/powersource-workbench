import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardIcon, CloudUploadIcon } from '@/icons/AllIcons'
import { fetchProfile, fetchWorkUsername } from '@/services/profile-api'
import {
  employeeIdFromRemoteOaUserId,
  publicContactEmail,
} from '@/utils/auth/workbench-username'
import {
  FEEDBACK_MAX_IMAGES,
  FeedbackSubmitError,
  isFeedbackApiConfigured,
  readFeedbackImageFile,
  submitFeedback,
  type FeedbackImagePayload,
} from '@/services/feedback-api'

interface FeedbackSectionProps {
  userId: string
  fallbackEmail: string
}

type FeedbackImageDraft = {
  id: string
  name: string
  previewUrl: string
  payload: FeedbackImagePayload
}

/**
 * Settings Feedback / Suggestions form with optional WeCom image attachments.
 * @param props - Signed-in user id and fallback email.
 * @returns Feedback settings UI.
 */
export function FeedbackSection({ userId, fallbackEmail }: FeedbackSectionProps) {
  const { t, i18n } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const [email, setEmail] = useState(() => publicContactEmail(fallbackEmail))
  const [employeeId, setEmployeeId] = useState('')
  const [osModel, setOsModel] = useState('')
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<FeedbackImageDraft[]>([])
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [isPrefilling, setIsPrefilling] = useState(Boolean(userId))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const canAddImages =
    !isPrefilling && !isSubmitting && images.length < FEEDBACK_MAX_IMAGES

  useEffect(() => {
    let cancelled = false
    /**
     * Prefills email and employee id from the signed-in profile when available.
     * @returns Nothing.
     */
    async function loadProfile(): Promise<void> {
      if (!userId) {
        setIsPrefilling(false)
        return
      }
      setIsPrefilling(true)
      try {
        const [profile, workUsername] = await Promise.all([
          fetchProfile(userId),
          fetchWorkUsername(userId),
        ])
        if (cancelled) {
          return
        }
        setEmail(
          publicContactEmail(profile?.email) || publicContactEmail(fallbackEmail),
        )
        const staffId =
          workUsername ||
          profile?.employee_id?.trim() ||
          employeeIdFromRemoteOaUserId(userId)
        if (staffId) {
          setEmployeeId(staffId)
        }
      } finally {
        if (!cancelled) {
          setIsPrefilling(false)
        }
      }
    }
    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [userId, fallbackEmail])

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) {
        URL.revokeObjectURL(image.previewUrl)
      }
    }
  }, [])

  const canSubmit =
    !isPrefilling &&
    !isSubmitting &&
    email.trim().length > 0 &&
    employeeId.trim().length > 0 &&
    osModel.trim().length > 0 &&
    message.trim().length > 0 &&
    isFeedbackApiConfigured()

  /**
   * Clears selected image drafts and their object URLs.
   * @returns Nothing.
   */
  function clearImages(): void {
    setImages((prev) => {
      for (const image of prev) {
        URL.revokeObjectURL(image.previewUrl)
      }
      return []
    })
  }

  /**
   * Resets drag-over highlight state after leave or drop.
   * @returns Nothing.
   */
  function clearDragOver(): void {
    dragDepthRef.current = 0
    setIsDragOver(false)
  }

  /**
   * Adds JPEG/PNG files from picker, drop, or clipboard (max 3 total).
   * @param files - Image files to append.
   * @returns Nothing.
   */
  async function handleImageFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return
    }
    setErrorCode(null)
    setSuccess(false)
    const remaining = FEEDBACK_MAX_IMAGES - images.length
    if (remaining <= 0) {
      setErrorCode('invalid_images')
      return
    }
    const next: FeedbackImageDraft[] = []
    try {
      for (const file of files.slice(0, remaining)) {
        const payload = await readFeedbackImageFile(file)
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          payload,
        })
      }
      setImages((prev) => [...prev, ...next])
    } catch (error) {
      for (const draft of next) {
        URL.revokeObjectURL(draft.previewUrl)
      }
      if (error instanceof FeedbackSubmitError) {
        setErrorCode(error.code)
      } else {
        setErrorCode('invalid_images')
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /**
   * Handles the hidden file input change event.
   * @param fileList - Selected files from the picker.
   * @returns Nothing.
   */
  async function handleImagePick(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) {
      return
    }
    await handleImageFiles(Array.from(fileList))
  }

  /**
   * Reads image blobs from the system clipboard and attaches them.
   * @returns Nothing.
   */
  async function handlePasteFromClipboard(): Promise<void> {
    if (!canAddImages) {
      return
    }
    setErrorCode(null)
    setSuccess(false)
    try {
      if (!navigator.clipboard?.read) {
        setErrorCode('clipboard')
        return
      }
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const mime = item.types.find(
          (type) => type === 'image/png' || type === 'image/jpeg',
        )
        if (!mime) {
          continue
        }
        const blob = await item.getType(mime)
        const extension = mime === 'image/png' ? 'png' : 'jpg'
        files.push(
          new File([blob], `clipboard-${Date.now()}.${extension}`, {
            type: mime,
          }),
        )
      }
      if (files.length === 0) {
        setErrorCode('clipboard')
        return
      }
      await handleImageFiles(files)
    } catch {
      setErrorCode('clipboard')
    }
  }

  /**
   * Accepts image files pasted with Ctrl/Cmd+V onto the upload zone.
   * @param event - Clipboard paste event.
   * @returns Nothing.
   */
  function handleImagePaste(event: ClipboardEvent<HTMLDivElement>): void {
    if (!canAddImages) {
      return
    }
    const files = Array.from(event.clipboardData?.files ?? []).filter(
      (file) =>
        file.type === 'image/jpeg' ||
        file.type === 'image/png' ||
        /\.(jpe?g|png)$/i.test(file.name),
    )
    if (files.length === 0) {
      return
    }
    event.preventDefault()
    void handleImageFiles(files)
  }

  /**
   * Handles drag enter for the image drop zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragEnter(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (!canAddImages) {
      return
    }
    dragDepthRef.current += 1
    setIsDragOver(true)
  }

  /**
   * Keeps the drop allowed while dragging over the zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    if (!canAddImages) {
      event.dataTransfer.dropEffect = 'none'
      return
    }
    event.dataTransfer.dropEffect = 'copy'
  }

  /**
   * Clears highlight when the pointer leaves the drop zone.
   * @param event - Drag event.
   * @returns Nothing.
   */
  function handleImageDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragOver(false)
    }
  }

  /**
   * Accepts dropped image files into the feedback attachment list.
   * @param event - Drop event.
   * @returns Nothing.
   */
  function handleImageDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
    clearDragOver()
    if (!canAddImages) {
      return
    }
    void handleImagePick(event.dataTransfer.files)
  }

  /**
   * Removes one attachment by id.
   * @param id - Draft id.
   * @returns Nothing.
   */
  function removeImage(id: string): void {
    setImages((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((item) => item.id !== id)
    })
    setSuccess(false)
    setErrorCode(null)
  }

  /**
   * Submits the feedback form to workbench-api.
   * @returns Nothing.
   */
  async function handleSubmit(): Promise<void> {
    setErrorCode(null)
    setSuccess(false)
    setIsSubmitting(true)
    try {
      await submitFeedback({
        email,
        employeeId,
        osModel,
        message,
        locale: i18n.language,
        images: images.map((item) => item.payload),
      })
      setMessage('')
      clearImages()
      setSuccess(true)
    } catch (error) {
      if (error instanceof FeedbackSubmitError) {
        setErrorCode(error.code)
      } else {
        setErrorCode('server')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Maps a submission error code to a localized message.
   * @param code - Error code from {@link FeedbackSubmitError}.
   * @returns Localized string.
   */
  function errorMessage(code: string): string {
    switch (code) {
      case 'invalid_email':
        return t('settings.feedback.errors.invalidEmail')
      case 'invalid_employee_id':
        return t('settings.feedback.errors.invalidEmployeeId')
      case 'invalid_os_model':
        return t('settings.feedback.errors.invalidOsModel')
      case 'invalid_message':
        return t('settings.feedback.errors.invalidMessage')
      case 'invalid_images':
        return t('settings.feedback.errors.invalidImages')
      case 'clipboard':
        return t('settings.feedback.errors.clipboard')
      case 'not_configured':
        return t('settings.feedback.errors.notConfigured')
      case 'network':
        return t('settings.feedback.errors.network')
      default:
        return t('settings.feedback.errors.server')
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.feedback')}</p>

      <section className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.feedback.emailLabel')}
            <span className="text-rose-500" aria-hidden>
              {' '}
              *
            </span>
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            disabled={isPrefilling || isSubmitting}
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none focus:border-brand/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/40"
            placeholder={t('settings.feedback.emailPlaceholder')}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setSuccess(false)
              setErrorCode(null)
            }}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted">
              {t('settings.feedback.employeeIdLabel')}
              <span className="text-rose-500" aria-hidden>
                {' '}
                *
              </span>
            </span>
            <input
              type="text"
              required
              autoComplete="off"
              disabled={isPrefilling || isSubmitting}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none focus:border-brand/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/40"
              placeholder={t('settings.feedback.employeeIdPlaceholder')}
              value={employeeId}
              onChange={(event) => {
                setEmployeeId(event.target.value)
                setSuccess(false)
                setErrorCode(null)
              }}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted">
              {t('settings.feedback.osModelLabel')}
              <span className="text-rose-500" aria-hidden>
                {' '}
                *
              </span>
            </span>
            <input
              type="text"
              required
              autoComplete="off"
              disabled={isPrefilling || isSubmitting}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none focus:border-brand/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/40"
              placeholder={t('settings.feedback.osModelPlaceholder')}
              value={osModel}
              onChange={(event) => {
                setOsModel(event.target.value)
                setSuccess(false)
                setErrorCode(null)
              }}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.feedback.messageLabel')}
            <span className="text-rose-500" aria-hidden>
              {' '}
              *
            </span>
          </span>
          <p className="text-[11px] text-muted">
            {t('settings.feedback.messageHint')}
          </p>
          <textarea
            required
            rows={6}
            disabled={isPrefilling || isSubmitting}
            className="w-full resize-y rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none focus:border-brand/40 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950/40"
            placeholder={t('settings.feedback.messagePlaceholder')}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              setSuccess(false)
              setErrorCode(null)
            }}
          />
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">
              {t('settings.feedback.imagesLabel')}
            </span>
            <span className="text-[11px] text-muted">
              {t('settings.feedback.imagesHint', {
                count: images.length,
                max: FEEDBACK_MAX_IMAGES,
              })}
            </span>
          </div>
          {images.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {images.map((image) => (
                <li
                  key={image.id}
                  className="relative size-20 overflow-hidden rounded-xl border border-zinc-950/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40"
                >
                  <img
                    src={image.previewUrl}
                    alt={image.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white"
                    disabled={isSubmitting}
                    onClick={() => removeImage(image.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            tabIndex={canAddImages ? 0 : -1}
            className={[
              'overflow-hidden rounded-2xl border outline-none transition-colors',
              isDragOver
                ? 'border-brand/50 bg-brand/5 ring-2 ring-brand/20'
                : 'border-zinc-950/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40',
              !canAddImages ? 'opacity-60' : '',
            ].join(' ')}
            onDragEnter={handleImageDragEnter}
            onDragOver={handleImageDragOver}
            onDragLeave={handleImageDragLeave}
            onDrop={handleImageDrop}
            onPaste={handleImagePaste}
          >
            <div className="grid sm:grid-cols-2">
              <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
                <span
                  className={[
                    'flex size-14 items-center justify-center rounded-full',
                    isDragOver
                      ? 'bg-brand/15 text-brand'
                      : 'bg-brand/10 text-brand',
                  ].join(' ')}
                  aria-hidden
                >
                  <CloudUploadIcon className="size-7" />
                </span>
                <p className="text-base font-bold text-brand">
                  {t('settings.feedback.imagesDrag')}
                </p>
              </div>
              <div className="flex min-h-40 flex-col items-stretch justify-center gap-3 border-t border-zinc-950/10 px-4 py-6 sm:border-l sm:border-t-0 dark:border-white/10">
                <p className="text-sm font-semibold text-muted">
                  {t('settings.feedback.imagesOrSelect')}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  multiple
                  className="hidden"
                  disabled={!canAddImages}
                  onChange={(event) => {
                    void handleImagePick(event.target.files)
                  }}
                />
                <button
                  type="button"
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                  disabled={!canAddImages}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('settings.feedback.browseFiles')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-950/10 bg-white/80 px-4 py-2.5 text-sm font-semibold text-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/50"
                  disabled={!canAddImages}
                  onClick={() => {
                    void handlePasteFromClipboard()
                  }}
                >
                  <ClipboardIcon className="size-4" aria-hidden />
                  {t('settings.feedback.pasteFromClipboard')}
                </button>
                <p className="text-[11px] text-muted">
                  {t('settings.feedback.imagesFormats')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
          disabled={!canSubmit}
          onClick={() => {
            void handleSubmit()
          }}
        >
          {isSubmitting
            ? t('settings.feedback.sending')
            : t('settings.feedback.send')}
        </button>

        {!isFeedbackApiConfigured() ? (
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-300">
            {t('settings.feedback.errors.notConfigured')}
          </p>
        ) : null}
        {errorCode ? (
          <p className="text-sm font-semibold text-red-500">{errorMessage(errorCode)}</p>
        ) : null}
        {success ? (
          <p className="text-sm font-semibold text-brand">{t('settings.feedback.success')}</p>
        ) : null}
      </section>
    </div>
  )
}
