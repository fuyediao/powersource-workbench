/**
 * KOL orders tab: shipment / tracking rows with pagination.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
  newShipmentId,
} from '@/components/admin/kol-detail/detail-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { CloseIcon, PlusIcon } from '@/icons/AllIcons'
import type { KolFormInput, KolShipment } from '@/types/kol'

const SHIPMENTS_PAGE_SIZE = 4

interface OrdersPanelProps {
  form: KolFormInput
  editing: boolean
  onPatch: (patch: Partial<KolFormInput>) => void
}

/**
 * Persistable shipment list (tracking number + shipping status).
 * @param props - Form, edit flag, and patch.
 * @returns Panel UI.
 */
export function OrdersPanel({ form, editing, onPatch }: OrdersPanelProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const shipments = form.shipments ?? []
  const totalPages = Math.max(1, Math.ceil(shipments.length / SHIPMENTS_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(
    () =>
      shipments.slice(
        (safePage - 1) * SHIPMENTS_PAGE_SIZE,
        safePage * SHIPMENTS_PAGE_SIZE,
      ),
    [safePage, shipments],
  )

  /**
   * Replaces one shipment row by id.
   * @param id - Row id.
   * @param patch - Partial row.
   * @returns Nothing.
   */
  function patchRow(id: string, patch: Partial<KolShipment>): void {
    onPatch({
      shipments: shipments.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    })
  }

  /**
   * Appends an empty shipment row and jumps to its page.
   * @returns Nothing.
   */
  function addRow(): void {
    const next = [
      ...shipments,
      { id: newShipmentId(), trackingNumber: '', shippingStatus: '' },
    ]
    onPatch({ shipments: next })
    setPage(Math.ceil(next.length / SHIPMENTS_PAGE_SIZE))
  }

  /**
   * Removes a shipment row.
   * @param id - Row id.
   * @returns Nothing.
   */
  function removeRow(id: string): void {
    onPatch({ shipments: shipments.filter((row) => row.id !== id) })
  }

  return (
    <div className={`${detailSectionCardClass()} space-y-6`}>
      <p className="text-xs text-muted">{t('admin.kolDetail.ordersHint')}</p>
      {shipments.length === 0 && !editing ? (
        <p className="text-sm text-muted">{t('admin.kolDetail.noShipments')}</p>
      ) : null}
      <div className="space-y-4">
        {paged.map((row) => {
          const n = shipments.findIndex((s) => s.id === row.id) + 1
          return (
            <div
              key={row.id}
              className="space-y-3 rounded-xl border border-ink/10 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted">
                  {t('admin.kolDetail.shipmentTitle', { n })}
                </p>
                {editing ? (
                  <button
                    type="button"
                    className="shrink-0 text-muted hover:text-rose-500"
                    title={t('admin.kolDetail.removeShipment')}
                    onClick={() => removeRow(row.id)}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={KOL_DETAIL_LABEL_CLASS}>
                    {t('admin.kolDetail.field.trackingNumber')}
                  </label>
                  <input
                    type="text"
                    disabled={!editing}
                    value={row.trackingNumber}
                    className={`${KOL_DETAIL_INPUT_CLASS} disabled:opacity-100`}
                    onChange={(event) =>
                      patchRow(row.id, { trackingNumber: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className={KOL_DETAIL_LABEL_CLASS}>
                    {t('admin.kolDetail.field.shippingStatus')}
                  </label>
                  <input
                    type="text"
                    disabled={!editing}
                    value={row.shippingStatus}
                    placeholder={t(
                      'admin.kolDetail.field.shippingStatusPlaceholder',
                    )}
                    className={`${KOL_DETAIL_INPUT_CLASS} disabled:opacity-100`}
                    onChange={(event) =>
                      patchRow(row.id, { shippingStatus: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {shipments.length > SHIPMENTS_PAGE_SIZE ? (
        <PaginationStrip
          currentPage={safePage}
          totalPages={totalPages}
          onGoToPage={setPage}
        />
      ) : null}
      {editing ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand/15 px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/25"
          onClick={addRow}
        >
          <PlusIcon className="size-3.5" />
          {t('admin.kolDetail.addShipment')}
        </button>
      ) : null}
    </div>
  )
}
