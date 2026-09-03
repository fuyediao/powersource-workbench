/**
 * Compose-time CRM customer / contact picker (permission-gated).
 * Searches company email and contacts; picking appends to the To field.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, LucideBuilding2Icon, SearchIcon, UserIcon } from '@/icons/AllIcons'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
} from '@/services/groups-api'
import {
  formatCrmMailRecipient,
  loadCrmMailCustomerRecipients,
  searchCrmMailCustomers,
  searchCrmMailRecipients,
  type CrmMailContactHit,
  type CrmMailCustomerRecipients,
  type CrmMailRecipientHit,
} from '@/services/mail-crm-recipients-api'

interface MailCrmRecipientPickerProps {
  userId: string
  /** Existing To/Cc tokens so duplicates are skipped. */
  existingRecipients: string
  /**
   * Adds one or more formatted recipient tokens.
   * @param tokens - `Name <email>` or bare emails.
   */
  onAddRecipients: (tokens: string[]) => void
}

type PickerPhase =
  | { kind: 'search' }
  | { kind: 'customer'; detail: CrmMailCustomerRecipients }

/**
 * Extracts lowercase emails already present in a recipient field.
 * @param raw - Comma-separated recipients.
 * @returns Email set.
 */
function existingEmailSet(raw: string): Set<string> {
  const set = new Set<string>()
  for (const part of raw.split(',')) {
    const angle = /<([^>]+)>/.exec(part)
    const email = (angle?.[1] ?? part).trim().toLowerCase()
    if (email.includes('@')) {
      set.add(email)
    }
  }
  return set
}

/**
 * Permission-gated CRM recipient picker for the mail composer.
 * Requires desktop Admin entry (`desktop_admin`); data is still RLS-scoped.
 * @param props - User id and add-recipient handler.
 * @returns Picker control, or null when the user cannot open Admin CRM.
 */
export function MailCrmRecipientPicker({
  userId,
  existingRecipients,
  onAddRecipients,
}: MailCrmRecipientPickerProps): ReactNode {
  const { t } = useTranslation()
  const access = useDesktopModuleAccess(userId)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<PickerPhase>({ kind: 'search' })
  const [hits, setHits] = useState<CrmMailRecipientHit[]>([])
  const [customerHits, setCustomerHits] = useState<
    Array<{
      customerId: string
      companyName: string
      customerCode: string | null
      email: string | null
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<{
    isSystemAdmin: boolean
    groupId: string | null
  } | null>(null)

  const canUseCrm =
    access.isLoaded && (access.hasUnrestrictedAccess || access.isEntryAllowed('desktop_admin'))

  useEffect(() => {
    if (!canUseCrm || !open) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [role, group] = await Promise.all([
          fetchUserRole(userId),
          fetchCurrentGroup(userId),
        ])
        if (cancelled) {
          return
        }
        setScope({
          isSystemAdmin: isSystemAdminRole(role),
          groupId: group?.id ?? null,
        })
      } catch (err) {
        console.error('[MailCrmRecipientPicker] scope:', err)
        if (!cancelled) {
          setScope({ isSystemAdmin: false, groupId: null })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUseCrm, open, userId])

  useEffect(() => {
    if (!open || !scope || phase.kind !== 'search') {
      return
    }
    const q = query.trim()
    if (q.length < 1) {
      setHits([])
      setCustomerHits([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void Promise.all([
        searchCrmMailRecipients(q, { ...scope, limit: 12 }),
        searchCrmMailCustomers(q, { ...scope, limit: 12 }),
      ])
        .then(([recipientHits, companies]) => {
          if (cancelled) {
            return
          }
          setHits(recipientHits)
          setCustomerHits(companies)
        })
        .catch((err: unknown) => {
          console.error('[MailCrmRecipientPicker] search:', err)
          if (!cancelled) {
            setHits([])
            setCustomerHits([])
            setError(t('mail.crmPicker.error'))
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, phase, query, scope, t])

  useEffect(() => {
    if (!open) {
      return
    }
    /**
     * Closes the panel when clicking outside.
     * @param event - Pointer event.
     */
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  /**
   * Resets transient picker state when closing.
   */
  const resetPanel = useCallback((): void => {
    setQuery('')
    setHits([])
    setCustomerHits([])
    setPhase({ kind: 'search' })
    setError(null)
    setLoading(false)
  }, [])

  /**
   * Appends emails that are not already on the draft, then closes.
   * @param tokens - Formatted recipients.
   */
  function addTokens(tokens: string[]): void {
    const existing = existingEmailSet(existingRecipients)
    const next: string[] = []
    for (const token of tokens) {
      const angle = /<([^>]+)>/.exec(token)
      const email = (angle?.[1] ?? token).trim().toLowerCase()
      if (!email.includes('@') || existing.has(email)) {
        continue
      }
      existing.add(email)
      next.push(token)
    }
    if (next.length > 0) {
      onAddRecipients(next)
    }
    setOpen(false)
    resetPanel()
  }

  /**
   * Opens the company detail step (company email + contacts).
   * @param customerId - Customer id.
   * @param companyName - Display name.
   * @param companyEmail - Optional company email.
   */
  function openCustomer(
    customerId: string,
    companyName: string,
    companyEmail: string | null,
  ): void {
    setLoading(true)
    setError(null)
    void loadCrmMailCustomerRecipients(customerId, companyName, companyEmail)
      .then((detail) => {
        setPhase({ kind: 'customer', detail })
      })
      .catch((err: unknown) => {
        console.error('[MailCrmRecipientPicker] load customer:', err)
        setError(t('mail.crmPicker.error'))
      })
      .finally(() => setLoading(false))
  }

  if (!canUseCrm) {
    return null
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-muted hover:text-brand"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open) {
            setOpen(false)
            resetPanel()
            return
          }
          setOpen(true)
        }}
      >
        <LucideBuilding2Icon className="size-3.5" />
        <span>{t('mail.crmPicker.selectCustomer')}</span>
        <ChevronDownIcon className={`size-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-1 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-lg border border-mail-divider bg-mail-menu-solid shadow-xl"
        >
          {phase.kind === 'search' ? (
            <>
              <div className="flex items-center gap-2 border-b border-mail-divider px-3 py-2">
                <SearchIcon className="size-3.5 shrink-0 text-muted" />
                <input
                  type="search"
                  value={query}
                  autoFocus
                  placeholder={t('mail.crmPicker.searchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {loading ? (
                  <p className="px-3 py-2 text-[12px] text-muted">{t('mail.crmPicker.searching')}</p>
                ) : null}
                {error ? <p className="px-3 py-2 text-[12px] text-red-500">{error}</p> : null}
                {!loading && !error && query.trim().length > 0 && customerHits.length === 0 && hits.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-muted">{t('mail.crmPicker.empty')}</p>
                ) : null}
                {customerHits.length > 0 ? (
                  <div className="px-2 pb-1">
                    <p className="px-1 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                      {t('mail.crmPicker.customers')}
                    </p>
                    {customerHits.map((row) => (
                      <button
                        key={`customer-${row.customerId}`}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-mail-row-hover"
                        onClick={() => openCustomer(row.customerId, row.companyName, row.email)}
                      >
                        <LucideBuilding2Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{row.companyName}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {row.email ?? t('mail.crmPicker.noCompanyEmail')}
                            {row.customerCode ? ` · ${row.customerCode}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {hits.filter((h) => h.kind === 'contact').length > 0 ? (
                  <div className="px-2 pb-1">
                    <p className="px-1 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                      {t('mail.crmPicker.contacts')}
                    </p>
                    {(hits.filter((h) => h.kind === 'contact') as CrmMailContactHit[]).map((row) => (
                      <button
                        key={`contact-${row.contactId}`}
                        type="button"
                        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-mail-row-hover"
                        onClick={() => addTokens([formatCrmMailRecipient(row.name, row.email)])}
                      >
                        <UserIcon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{row.name}</span>
                          <span className="block truncate text-[11px] text-muted">
                            {row.email}
                            {row.companyName ? ` · ${row.companyName}` : ''}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-mail-divider px-3 py-2">
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-brand hover:underline"
                  onClick={() => setPhase({ kind: 'search' })}
                >
                  {t('mail.crmPicker.back')}
                </button>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                  {phase.detail.companyName}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto py-1">
                {loading ? (
                  <p className="px-3 py-2 text-[12px] text-muted">{t('mail.crmPicker.searching')}</p>
                ) : null}
                {error ? <p className="px-3 py-2 text-[12px] text-red-500">{error}</p> : null}
                {phase.detail.companyEmail ? (
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-mail-row-hover"
                    onClick={() =>
                      addTokens([
                        formatCrmMailRecipient(phase.detail.companyName, phase.detail.companyEmail!),
                      ])
                    }
                  >
                    <LucideBuilding2Icon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-muted">{t('mail.crmPicker.companyEmail')}</span>
                      <span className="block truncate text-[13px] text-ink">{phase.detail.companyEmail}</span>
                    </span>
                  </button>
                ) : (
                  <p className="px-3 py-1.5 text-[12px] text-muted">{t('mail.crmPicker.noCompanyEmail')}</p>
                )}
                {phase.detail.contacts.length > 0 ? (
                  <div className="mt-1 border-t border-mail-divider pt-1">
                    <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">
                      {t('mail.crmPicker.contacts')}
                    </p>
                    {phase.detail.contacts.map((row) => (
                      <button
                        key={row.contactId}
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-mail-row-hover"
                        onClick={() => addTokens([formatCrmMailRecipient(row.name, row.email)])}
                      >
                        <UserIcon className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">
                            {row.name}
                            {row.title ? ` · ${row.title}` : ''}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{row.email}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : !loading ? (
                  <p className="px-3 py-2 text-[12px] text-muted">{t('mail.crmPicker.noContacts')}</p>
                ) : null}
                {(phase.detail.companyEmail || phase.detail.contacts.length > 0) ? (
                  <div className="border-t border-mail-divider px-3 py-2">
                    <button
                      type="button"
                      className="w-full rounded-md bg-brand/10 px-2 py-1.5 text-[12px] font-medium text-brand hover:bg-brand/15"
                      onClick={() => {
                        const tokens: string[] = []
                        if (phase.detail.companyEmail) {
                          tokens.push(
                            formatCrmMailRecipient(
                              phase.detail.companyName,
                              phase.detail.companyEmail,
                            ),
                          )
                        }
                        for (const row of phase.detail.contacts) {
                          tokens.push(formatCrmMailRecipient(row.name, row.email))
                        }
                        addTokens(tokens)
                      }}
                    >
                      {t('mail.crmPicker.addAll')}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
