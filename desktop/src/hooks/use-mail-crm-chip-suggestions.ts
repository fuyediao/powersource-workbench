/**
 * Loads CRM recipient suggestions for mail compose chip fields.
 * Gated by desktop Admin entry; data remains RLS-scoped.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
} from '@/services/groups-api'
import {
  formatCrmMailRecipient,
  searchCrmMailRecipients,
} from '@/services/mail-crm-recipients-api'

/**
 * Debounced CRM To/Cc suggestions for the composer chip fields.
 * @param userId - Signed-in user, or null when unavailable.
 * @returns Suggestion tokens and a query setter.
 */
export function useMailCrmChipSuggestions(userId: string | null): {
  suggestions: string[]
  setQuery: (query: string) => void
} {
  const access = useDesktopModuleAccess(userId)
  const canUseCrm =
    Boolean(userId)
    && access.isLoaded
    && (access.hasUnrestrictedAccess || access.isEntryAllowed('desktop_admin'))

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const scopeRef = useRef<{ isSystemAdmin: boolean; groupId: string | null } | null>(null)

  useEffect(() => {
    if (!canUseCrm || !userId) {
      scopeRef.current = null
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
        scopeRef.current = {
          isSystemAdmin: isSystemAdminRole(role),
          groupId: group?.id ?? null,
        }
      } catch (err) {
        console.error('[useMailCrmChipSuggestions] scope:', err)
        if (!cancelled) {
          scopeRef.current = { isSystemAdmin: false, groupId: null }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUseCrm, userId])

  useEffect(() => {
    if (!canUseCrm) {
      setSuggestions([])
      return
    }
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    const scope = scopeRef.current
    if (!scope) {
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchCrmMailRecipients(q, { ...scope, limit: 8 })
        .then((hits) => {
          if (cancelled) {
            return
          }
          setSuggestions(
            hits.map((hit) =>
              hit.kind === 'company'
                ? formatCrmMailRecipient(hit.companyName, hit.email)
                : formatCrmMailRecipient(hit.name, hit.email),
            ),
          )
        })
        .catch((err: unknown) => {
          console.error('[useMailCrmChipSuggestions] search:', err)
          if (!cancelled) {
            setSuggestions([])
          }
        })
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [canUseCrm, query])

  const setQueryStable = useCallback((next: string) => {
    setQuery(next)
  }, [])

  return { suggestions: canUseCrm ? suggestions : [], setQuery: setQueryStable }
}
