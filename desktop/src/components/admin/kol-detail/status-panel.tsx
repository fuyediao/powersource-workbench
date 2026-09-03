/**
 * KOL status tab: engagement, owner, dates, tested products, communication history.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  isoToDateInput,
  isoToDatetimeLocal,
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
  memberLabelForOwner,
  ownerLabel,
} from '@/components/admin/kol-detail/detail-shared'
import { VisitLogProductPicker } from '@/components/admin/visit-log-product-picker'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  KOL_COOPERATION_STATUS_VALUES,
  KOL_CURRENT_STATUS_VALUES,
  kolCooperationBadgeClass,
  kolCurrentStatusBadgeClass,
} from '@/constants/kol-constants'
import { CloseIcon, PlusIcon } from '@/icons/AllIcons'
import type { GroupMemberRecord, ProfileSnippet } from '@/services/groups-api'
import type {
  KolCooperationStatus,
  KolCurrentStatus,
  KolFormInput,
} from '@/types/kol'

interface StatusPanelProps {
  form: KolFormInput
  editing: boolean
  members: GroupMemberRecord[]
  /** Profile for `form.ownerId` when that user is not a group member. */
  ownerSnippet: ProfileSnippet | null
  userEmail: string | null
  onPatch: (patch: Partial<KolFormInput>) => void
}

/**
 * Status / management fields including owner and communication history.
 * @param props - Form, members, owner profile, user email, and patch.
 * @returns Panel UI.
 */
export function StatusPanel({
  form,
  editing,
  members,
  ownerSnippet,
  userEmail,
  onPatch,
}: StatusPanelProps) {
  const { t } = useTranslation()
  const [newComm, setNewComm] = useState('')
  const testedProductCopy = useMemo(
    () => ({
      placeholder: t('admin.kolDetail.field.testedProductPlaceholder'),
      searchPlaceholder: t('admin.kolDetail.field.testedProductSearchPlaceholder'),
      hint: t('admin.kolDetail.field.testedProductHint'),
      empty: t('admin.kolDetail.field.testedProductEmpty'),
      loadFailed: t('admin.kolDetail.field.testedProductLoadFailed'),
      removeAria: t('admin.kolDetail.field.removeTestedProduct'),
    }),
    [t],
  )

  const currentStatusOptions = useMemo(
    () => [
      { value: '', label: '—' },
      ...KOL_CURRENT_STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`admin.kol.currentStatus.${status}`),
      })),
    ],
    [t],
  )

  const cooperationOptions = useMemo(
    () => [
      { value: '', label: '—' },
      ...KOL_COOPERATION_STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`admin.kol.cooperationStatus.${status}`),
      })),
    ],
    [t],
  )

  const ownerOptions = useMemo(() => {
    const options = [
      { value: '', label: '—' },
      ...members.map((member) => ({
        value: member.userId,
        label: memberLabelForOwner(member),
      })),
    ]
    const ownerId = form.ownerId
    if (ownerId && !options.some((option) => option.value === ownerId)) {
      options.splice(1, 0, {
        value: ownerId,
        label: ownerLabel(ownerId, members, ownerSnippet),
      })
    }
    return options
  }, [form.ownerId, members, ownerSnippet])

  /**
   * Prepends a communication history entry.
   * @returns Nothing.
   */
  function addCommEntry(): void {
    const content = newComm.trim()
    if (!content) {
      return
    }
    onPatch({
      communicationHistory: [
        {
          at: new Date().toISOString(),
          content,
          by: userEmail ?? undefined,
        },
        ...(form.communicationHistory ?? []),
      ],
    })
    setNewComm('')
  }

  return (
    <div className={`${detailSectionCardClass()} space-y-6`}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS}>
            {t('admin.kolDetail.field.currentStatus')}
          </label>
          {editing ? (
            <CrmFilterSelect
              className="w-full"
              value={form.currentStatus ?? ''}
              options={currentStatusOptions}
              ariaLabel={t('admin.kolDetail.field.currentStatus')}
              onChange={(next) =>
                onPatch({
                  currentStatus: (next || null) as KolCurrentStatus | null,
                })
              }
            />
          ) : form.currentStatus ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${kolCurrentStatusBadgeClass(
                form.currentStatus,
              )}`}
            >
              {t(`admin.kol.currentStatus.${form.currentStatus}`)}
            </span>
          ) : (
            <p className="text-sm text-ink">—</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS}>
            {t('admin.kolDetail.field.cooperationStatus')}
          </label>
          {editing ? (
            <CrmFilterSelect
              className="w-full"
              value={form.cooperationStatus ?? ''}
              options={cooperationOptions}
              ariaLabel={t('admin.kolDetail.field.cooperationStatus')}
              onChange={(next) =>
                onPatch({
                  cooperationStatus: (next || null) as KolCooperationStatus | null,
                })
              }
            />
          ) : form.cooperationStatus ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${kolCooperationBadgeClass(
                form.cooperationStatus,
              )}`}
            >
              {t(`admin.kol.cooperationStatus.${form.cooperationStatus}`)}
            </span>
          ) : (
            <p className="text-sm text-ink">—</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS}>{t('admin.kol.col.owner')}</label>
          {editing ? (
            <CrmFilterSelect
              className="w-full"
              value={form.ownerId ?? ''}
              options={ownerOptions}
              searchable
              emptyLabel={t('admin.kolDetail.ownerNoMembers')}
              ariaLabel={t('admin.kol.col.owner')}
              onChange={(next) => onPatch({ ownerId: next || null })}
            />
          ) : (
            <p className="text-sm text-ink">
              {ownerLabel(form.ownerId, members, ownerSnippet)}
            </p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-last-contact">
            {t('admin.kol.col.lastContact')}
          </label>
          {editing ? (
            <input
              id="kol-last-contact"
              type="datetime-local"
              value={isoToDatetimeLocal(form.lastContactAt)}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ lastContactAt: event.target.value || null })
              }
            />
          ) : (
            <p className="text-sm text-ink">
              {form.lastContactAt
                ? new Date(form.lastContactAt).toLocaleString()
                : '—'}
            </p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-reconnect">
            {t('admin.kolDetail.field.reconnectAt')}
          </label>
          {editing ? (
            <input
              id="kol-reconnect"
              type="date"
              value={isoToDateInput(form.reconnectAt)}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) =>
                onPatch({ reconnectAt: event.target.value || null })
              }
            />
          ) : (
            <p className="text-sm text-ink">{dash(isoToDateInput(form.reconnectAt))}</p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-commission">
            {t('admin.kolDetail.field.commission')}
          </label>
          {editing ? (
            <div className="relative">
              <input
                id="kol-commission"
                type="number"
                min={0}
                step="0.01"
                value={form.commission ?? ''}
                className={`${KOL_DETAIL_INPUT_CLASS} pr-8`}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  onPatch({ commission: raw ? Number(raw) : null })
                }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
                %
              </span>
            </div>
          ) : (
            <p className="text-sm text-ink">
              {form.commission != null ? `${form.commission}%` : '—'}
            </p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-meet-at">
            {t('admin.kolDetail.field.meetAt')}
          </label>
          {editing ? (
            <input
              id="kol-meet-at"
              type="datetime-local"
              value={isoToDatetimeLocal(form.meetAt)}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) => onPatch({ meetAt: event.target.value || null })}
            />
          ) : (
            <p className="text-sm text-ink">
              {form.meetAt ? new Date(form.meetAt).toLocaleString() : '—'}
            </p>
          )}
        </div>
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS} htmlFor="kol-check-cycle">
            {t('admin.kolDetail.field.checkCycleDays')}
          </label>
          {editing ? (
            <input
              id="kol-check-cycle"
              type="number"
              min={1}
              value={form.checkCycleDays ?? ''}
              className={KOL_DETAIL_INPUT_CLASS}
              onChange={(event) => {
                const raw = event.target.value.trim()
                onPatch({ checkCycleDays: raw ? Number(raw) : null })
              }}
            />
          ) : (
            <p className="text-sm text-ink">{dash(form.checkCycleDays)}</p>
          )}
        </div>
      </div>

      <div>
        <label className={`${KOL_DETAIL_LABEL_CLASS} mb-2`}>
          {t('admin.kolDetail.field.testedProducts')}
        </label>
        {!editing && (form.testedProducts ?? []).length === 0 ? (
          <p className="text-sm text-ink">—</p>
        ) : (
          <VisitLogProductPicker
            selectedProductIds={form.testedProducts ?? []}
            disabled={!editing}
            copy={testedProductCopy}
            onChange={(next) => onPatch({ testedProducts: next })}
          />
        )}
      </div>

      <div>
        <label className={`${KOL_DETAIL_LABEL_CLASS} mb-2`}>
          {t('admin.kolDetail.field.communicationHistory')}
        </label>
        <div className="mb-3 max-h-60 space-y-2 overflow-y-auto">
          {(form.communicationHistory ?? []).length === 0 ? (
            <p className="text-xs italic text-muted">
              {t('admin.kolDetail.noHistory')}
            </p>
          ) : (
            (form.communicationHistory ?? []).map((entry, idx) => (
              <div
                key={`${entry.at}-${idx}`}
                className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    {new Date(entry.at).toLocaleString()}
                    {entry.by ? <span className="ml-1">· {entry.by}</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{entry.content}</p>
                </div>
                {editing ? (
                  <button
                    type="button"
                    className="text-muted hover:text-rose-500"
                    onClick={() =>
                      onPatch({
                        communicationHistory: (
                          form.communicationHistory ?? []
                        ).filter((_, i) => i !== idx),
                      })
                    }
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newComm}
              placeholder={t('admin.kolDetail.field.newHistoryEntry')}
              className={`${KOL_DETAIL_INPUT_CLASS} flex-1 text-xs`}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCommEntry()
                }
              }}
              onChange={(event) => setNewComm(event.target.value)}
            />
            <button
              type="button"
              disabled={!newComm.trim()}
              className="rounded-xl bg-brand/15 px-3 py-2 text-xs font-semibold text-brand disabled:opacity-40"
              onClick={addCommEntry}
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
