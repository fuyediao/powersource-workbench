/**
 * Create custom location modal for the Electron map page.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { PRIORITY_OPTIONS } from '@/constants/priority'
import type { Coordinates } from '@/types/chat'
import type { FavoriteInput, FavoritePriority, PendingCoordinates } from '@/types/favorite'

interface CreateCustomLocationModalProps {
  isOpen: boolean
  pendingCoordinates?: PendingCoordinates
  userLocation?: Coordinates
  onClose: () => void
  onSave: (input: FavoriteInput) => void
}

/**
 * Centered modal to create a custom favorite location.
 *
 * @param props - Open state, optional coords, and callbacks
 * @returns Modal overlay or null
 */
export function CreateCustomLocationModal({
  isOpen,
  pendingCoordinates,
  userLocation,
  onClose,
  onSave,
}: CreateCustomLocationModalProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(isOpen, 200)
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
    if (!isOpen) return
    const lat = pendingCoordinates?.latitude ?? userLocation?.latitude
    const lng = pendingCoordinates?.longitude ?? userLocation?.longitude
    setShopName('')
    setAddress('')
    setLatitude(lat != null ? String(lat) : '')
    setLongitude(lng != null ? String(lng) : '')
    setHours('')
    setWebsite('')
    setNote('')
    setOpenSunday(false)
    setPriority('normal')
  }, [isOpen, pendingCoordinates, userLocation])

  if (!presence.mounted) return null

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
          <h2 className="text-lg font-extrabold text-brand">
            {t('chat.favorites.modal.addCustomLocation')}
          </h2>
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
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.locationName')}</span>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder={t('chat.favorites.modal.placeholders.locationName')}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.address')}</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.latitude')}</span>
              <input
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.longitude')}</span>
              <input
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.hours')}</span>
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">
              {t('chat.favorites.modal.website', { defaultValue: 'Website' })}
            </span>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.note')}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={openSunday}
              onChange={(e) => setOpenSunday(e.target.checked)}
              className="accent-(--brand)"
            />
            {t('chat.favorites.modal.openOnSunday')}
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted">{t('chat.favorites.modal.priority')}</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as FavoritePriority)}
              className="w-full rounded-xl border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>
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
              if (!shopName.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return
              onSave({
                shopName: shopName.trim(),
                latitude: lat,
                longitude: lng,
                address: address.trim() || undefined,
                hours: hours.trim() || undefined,
                website: website.trim() || undefined,
                note: note.trim() || undefined,
                openSunday,
                priority,
                tags: [],
              })
            }}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
          >
            {t('chat.favorites.modal.saveLocation')}
          </button>
        </div>
      </div>
    </div>
  )
}
