/**
 * PBC tab orchestration: group/individual scope, load docs/rows, scoring.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PbcDocumentHeader } from '@/components/team/pbc-document-header'
import { PbcPartTable } from '@/components/team/pbc-part-table'
import { PbcScoringRubric } from '@/components/team/pbc-scoring-rubric'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  fetchGroupMembersForGroup,
  fetchPbcRows,
  getOrCreateGroupDocument,
  getOrCreateIndividualDocument,
  listPbcDocuments,
  pbcCalendarMonthBounds,
  type TeamGroupMember,
} from '@/services/pbc-api'
import type { PbcDocument, PbcPart, PbcRow, PbcScope } from '@/types/pbc'
import {
  clearPbcMenu,
  patchTeamMenuHandlers,
  setTeamMenuView,
  usesNativeTeamMenu,
} from '@/utils/team-menu'

const PARTS: PbcPart[] = ['result', 'process', 'org_growth']

const PART_WEIGHTS: Record<PbcPart, number> = {
  result: 0.5,
  process: 0.3,
  org_growth: 0.2,
}

interface TeamPbcPaneProps {
  userId: string
  groupId: string | null
  fiscalYear: number
  periodMonth: number
  canManageTeam: boolean
  /** False for months older than current + previous (view-only). */
  periodEditable: boolean
}

/**
 * Parses leading digit of an evaluation string as 1–5.
 * @param val - Raw evaluation.
 * @returns Score or null.
 */
function parseScoreStr(val: string | null | undefined): number | null {
  if (!val) return null
  const n = Number.parseInt(val.charAt(0), 10)
  return n >= 1 && n <= 5 ? n : null
}

/**
 * Weighted total score (0–5) from self-evaluations.
 * @param rows - Document rows.
 * @returns Score or null when unscored.
 */
function computeDocScore(rows: PbcRow[]): number | null {
  if (rows.length === 0) return null
  let total = 0
  let hasAny = false
  for (const part of PARTS) {
    const partRows = rows.filter((r) => r.part === part)
    let partRaw = 0
    let partHas = false
    for (const row of partRows) {
      const s = parseScoreStr(row.selfEvaluation)
      if (s !== null && row.weightPercent != null) {
        partRaw += s * (row.weightPercent / 100)
        partHas = true
        hasAny = true
      }
    }
    if (partHas) total += partRaw * PART_WEIGHTS[part]
  }
  return hasAny ? total : null
}

/**
 * Display name for a team member.
 * @param member - Member row.
 * @returns Label.
 */
function memberLabel(member: TeamGroupMember): string {
  return (
    member.user?.display_name ||
    member.user?.full_name ||
    member.user?.email ||
    member.userId.slice(0, 8)
  )
}

/**
 * PBC collaboration pane for the Team Function.
 * @param props - User, group, period, manage grant.
 * @returns PBC UI.
 */
export function TeamPbcPane({
  userId,
  groupId,
  fiscalYear,
  periodMonth,
  canManageTeam,
  periodEditable,
}: TeamPbcPaneProps): ReactNode {
  const { t } = useTranslation()
  const [scope, setScope] = useState<PbcScope>('group')
  const prevScopeRef = useRef<PbcScope | null>(null)
  const scopeSlide =
    prevScopeRef.current && prevScopeRef.current !== scope
      ? scope === 'individual'
        ? 'animate-tab-page-forward'
        : 'animate-tab-page-back'
      : ''
  if (prevScopeRef.current !== scope) {
    prevScopeRef.current = scope
  }
  const [members, setMembers] = useState<TeamGroupMember[]>([])
  const [subjectUserId, setSubjectUserId] = useState('')
  const [document, setDocument] = useState<PbcDocument | null>(null)
  const [rows, setRows] = useState<PbcRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalScore = useMemo(() => computeDocScore(rows), [rows])
  const isIndividualOwner =
    document?.scope === 'individual' && document.subjectUserId === userId

  const canEditProgress =
    periodEditable &&
    (canManageTeam || (scope === 'individual' && isIndividualOwner))
  const canEditDefinition =
    periodEditable && (scope === 'group' ? canManageTeam : isIndividualOwner)
  const canEditAdmin = periodEditable && canManageTeam
  const canEditHeader = periodEditable && canManageTeam

  const memberOptions = useMemo(
    () => [
      { value: '', label: t('admin.team.pbcPickMember') },
      ...members.map((m) => ({ value: m.userId, label: memberLabel(m) })),
    ],
    [members, t],
  )
  const nativeTeamMenu = usesNativeTeamMenu()

  useEffect(() => {
    return () => clearPbcMenu()
  }, [])

  useEffect(() => {
    patchTeamMenuHandlers({
      setPbcScope: (next) => {
        setScope(next)
      },
      selectPbcMember: (userId) => {
        setSubjectUserId(userId)
      },
    })
  }, [])

  useEffect(() => {
    setTeamMenuView({
      pbcScope: scope,
      pbcMembers: members.map((member) => ({
        id: member.userId,
        label: memberLabel(member),
      })),
      selectedPbcMemberId: subjectUserId || null,
    })
  }, [members, scope, subjectUserId])

  /**
   * Loads members when group changes.
   */
  useEffect(() => {
    let cancelled = false
    if (!groupId) {
      setMembers([])
      setSubjectUserId('')
      return
    }
    void fetchGroupMembersForGroup(groupId)
      .then((list) => {
        if (cancelled) return
        setMembers(list)
        setSubjectUserId((current) => {
          if (current && list.some((m) => m.userId === current)) return current
          const self = list.find((m) => m.userId === userId)
          return self?.userId ?? list[0]?.userId ?? ''
        })
      })
      .catch((err) => {
        console.error('Load team members error:', err)
        if (!cancelled) setMembers([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId, userId])

  /**
   * Loads or creates the PBC document for the current filters.
   */
  const loadDocument = useCallback(async (): Promise<void> => {
    setError(null)
    if (!groupId || !isSupabaseConfigured) {
      setDocument(null)
      setRows([])
      setLoading(false)
      return
    }
    if (scope === 'individual' && !subjectUserId) {
      setDocument(null)
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      if (!periodEditable) {
        const docs = await listPbcDocuments(groupId, fiscalYear, periodMonth)
        const doc =
          scope === 'group'
            ? (docs.find((d) => d.scope === 'group') ?? null)
            : (docs.find(
                (d) =>
                  d.scope === 'individual' && d.subjectUserId === subjectUserId,
              ) ?? null)
        if (!doc) {
          setDocument(null)
          setRows([])
          return
        }
        const nextRows = await fetchPbcRows(doc.id)
        setDocument(doc)
        setRows(nextRows)
        return
      }

      const bounds = pbcCalendarMonthBounds(fiscalYear, periodMonth)
      const doc =
        scope === 'group'
          ? await getOrCreateGroupDocument({
              groupId,
              fiscalYear,
              periodMonth,
              validFrom: bounds.validFrom,
              validTo: bounds.validTo,
            })
          : await getOrCreateIndividualDocument({
              groupId,
              subjectUserId,
              fiscalYear,
              periodMonth,
              validFrom: bounds.validFrom,
              validTo: bounds.validTo,
            })
      const nextRows = await fetchPbcRows(doc.id)
      setDocument(doc)
      setRows(nextRows)
    } catch (err) {
      console.error('Load PBC error:', err)
      setError(err instanceof Error ? err.message : t('admin.team.pbcError'))
      setDocument(null)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fiscalYear, groupId, periodEditable, periodMonth, scope, subjectUserId, t])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  /**
   * Replaces a row in local state after save.
   * @param updated - Saved row.
   */
  function onRowUpdated(updated: PbcRow): void {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-100 px-5 py-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
        {t('admin.team.pbcSupabaseRequired')}
      </div>
    )
  }

  if (!groupId) {
    return <p className="text-sm font-medium text-muted">{t('admin.team.pbcNoGroup')}</p>
  }

  return (
    <div className="space-y-4">
      {nativeTeamMenu ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <SlidingSegmented
            value={scope}
            ariaLabel={t('admin.team.pbcTab')}
            options={[
              { value: 'group', label: t('admin.team.pbcGroupLabel') },
              { value: 'individual', label: t('admin.team.pbcIndividualLabel') },
            ]}
            onChange={setScope}
          />
          {scope === 'individual' ? (
            <CrmFilterSelect
              className="min-w-44 max-w-64"
              value={subjectUserId}
              options={memberOptions}
              ariaLabel={t('admin.team.pbcPickMember')}
              onChange={setSubjectUserId}
            />
          ) : null}
        </div>
      )}

      {error ? (
        <div className="space-y-2">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            type="button"
            className="rounded-xl bg-brand px-3 py-1.5 text-sm font-bold text-brand-fg"
            onClick={() => void loadDocument()}
          >
            {t('admin.team.pbcRetry')}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm font-medium text-ink">{t('admin.team.pbcLoading')}</p>
      ) : null}

      {!loading && scope === 'individual' && !subjectUserId ? (
        <p className="text-sm text-ink">{t('admin.team.pbcSelectMemberHint')}</p>
      ) : null}

      {!loading &&
      !document &&
      !error &&
      !periodEditable &&
      !(scope === 'individual' && !subjectUserId) ? (
        <p className="text-sm font-medium text-ink">{t('admin.team.periodNoDocumentHint')}</p>
      ) : null}

      {!loading && document ? (
        <div key={scope} className={`space-y-4 ${scopeSlide}`}>
          {scope === 'individual' ? (
            <h3 className="text-sm font-bold text-ink">
              {t('admin.team.pbcMemberPbcHeading', {
                name:
                  members.find((m) => m.userId === subjectUserId)?.user
                    ?.display_name ||
                  members.find((m) => m.userId === subjectUserId)?.user?.full_name ||
                  members.find((m) => m.userId === subjectUserId)?.user?.email ||
                  subjectUserId.slice(0, 8),
              })}
            </h3>
          ) : (
            <h3 className="text-sm font-bold text-ink">{t('admin.team.pbcGroupSection')}</h3>
          )}
          <PbcDocumentHeader
            document={document}
            canEdit={canEditHeader}
            totalScore={totalScore}
            onSaved={setDocument}
          />
          {PARTS.map((part) => (
            <PbcPartTable
              key={part}
              part={part}
              scope={scope}
              rows={rows.filter((r) => r.part === part)}
              canEditProgress={canEditProgress}
              canEditDefinition={canEditDefinition}
              canEditAdmin={canEditAdmin}
              isIndividualDocumentOwner={isIndividualOwner}
              onRowUpdated={onRowUpdated}
            />
          ))}
          <PbcScoringRubric />
        </div>
      ) : null}
    </div>
  )
}
