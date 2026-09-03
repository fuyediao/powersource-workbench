/**
 * Favorite edit modal for the Electron map page.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { PRIORITY_OPTIONS } from '@/constants/priority'
import type { Favorite, FavoriteInput, FavoritePriority } from '@/types/favorite'

interface FavoriteEditModalProps {
  isOpen: boolean
  favorite: Favorite | null
  onClose: () => void
  onSave: (favoriteId: string, updates: Partial<FavoriteInput>) => void
}

const fieldClassName =
  'w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50'

/**
 * Centered modal to edit a saved favorite.
 *
 * @param props - Open state, favorite, and callbacks
 * @returns Modal overlay or null
 */
export function FavoriteEditModal({ isOpen, favorite, onClose, onSave }: FavoriteEditModalProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(isOpen && favorite != null, 200)
  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [hours, setHours] = useState('')
  const [website, setWebsite] = useState('')
  const [note, setNote] = useState('')
  const [openSunday, setOpenSunday] = useState(false)
  const [priority, setPriority] = useState<FavoritePriority>('normal')

  useEffect(() => {
    if (!favorite || !isOpen) return
    setShopName(favorite.shopName)
    setAddress(favorite.address ?? '')
    setLatitude(String(favorite.latitude))
    setLongitude(String(favorite.longitude))
    setHours(favorite.hours ?? '')
    setWebsite(favorite.website ?? '')
    setNote(favorite.note ?? '')
    setOpenSunday(favorite.openSunday)
    setPriority(favorite.priority ?? 'normal')
  }, [favorite, isOpen])

  if (!presence.mounted || !favorite) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm"
        aria-label={t('chat.favorites.modal.cancel')}
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full max-w-lg rounded-3xl border border-zinc-950/10 bg-white/95 p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950/95 ${
          presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-brand">{t('chat.favorites.modal.editFavorite')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand/10 hover:text-brand"
            aria-label={t('chat.favorites.modal.cancel')}
          >
            <CloseIcon className="size-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <Field label={t('chat.favorites.modal.locationName')}>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className={fieldClassName}
            />
          </Field>
          <Field label={t('chat.favorites.modal.address')}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={fieldClassName}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('chat.favorites.modal.latitude')}>
              <input
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className={fieldClassName}
              />
            </Field>
            <Field label={t('chat.favorites.modal.longitude')}>
              <input
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className={fieldClassName}
              />
            </Field>
          </div>
          <Field label={t('chat.favorites.modal.hours')}>
            <input value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClassName} />
          </Field>
          <Field label={t('chat.favorites.modal.website')}>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={fieldClassName}
            />
          </Field>
          <Field label={t('chat.favorites.modal.note')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={fieldClassName}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={openSunday}
              onChange={(e) => setOpenSunday(e.target.checked)}
              className="accent-(--brand)"
            />
            {t('chat.favorites.modal.openOnSunday')}
          </label>
          <Field label={t('chat.favorites.modal.priority')}>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as FavoritePriority)}
              className={fieldClassName}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-bold text-muted hover:bg-zinc-950/5 dark:hover:bg-white/5"
          >
            {t('chat.favorites.modal.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const lat = Number(latitude)
              const lng = Number(longitude)
              onSave(favorite.id, {
                shopName: shopName.trim() || favorite.shopName,
                address: address.trim() || undefined,
                latitude: Number.isFinite(lat) ? lat : favorite.latitude,
                longitude: Number.isFinite(lng) ? lng : favorite.longitude,
                hours: hours.trim() || undefined,
                website: website.trim() || undefined,
                note: note.trim() || undefined,
                openSunday,
                priority,
              })
            }}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
          >
            {t('chat.favorites.modal.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Labeled form field wrapper.
 *
 * @param props - Label text and children
 * @returns Field block
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
    </label>
  )
}
