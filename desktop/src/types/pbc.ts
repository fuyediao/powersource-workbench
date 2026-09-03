/**
 * Domain types for the PBC (Personal Business Commitment) module.
 * Mirrors Supabase schema from `20260418_pbc_documents.sql`.
 */

/** Whether this document represents the whole group or a single member. */
export type PbcScope = 'group' | 'individual'

/** The three parts of a PBC document. */
export type PbcPart = 'result' | 'process' | 'org_growth'

/** Row classification used in the scoring rubric section. */
export type PbcRowKind = 'normal' | 'bonus' | 'observation'

/** A single sub-item inside `milestones` JSONB. */
export interface PbcMilestone {
  label: string
  detail: string
}

/**
 * One PBC commitment-letter document (group × scope × subject × year × month).
 */
export interface PbcDocument {
  id: string
  groupId: string
  scope: PbcScope
  /** Null for group-scope documents. */
  subjectUserId: string | null
  fiscalYear: number
  /** Calendar month 1–12. */
  periodMonth: number
  validFrom: string | null
  validTo: string | null
  committerDisplayName: string | null
  departmentLabel: string | null
  positionLabel: string | null
  /** Free-form overall direction text (newline-separated bullet list). */
  overallDirection: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** One row inside a PBC document. */
export interface PbcRow {
  id: string
  documentId: string
  part: PbcPart
  sortOrder: number
  rowKind: PbcRowKind
  code: string | null
  title: string | null
  annualTarget: string | null
  milestones: PbcMilestone[] | null
  definition: string | null
  weightPercent: number | null
  evaluationPeriod: string | null
  currentProgress: string | null
  selfEvaluation: string | null
  managerEvaluation: string | null
  createdAt: string
  updatedAt: string
}

/** Fields a member can update on their own individual doc. */
export interface PbcRowProgressUpdate {
  currentProgress?: string | null
  definition?: string | null
  selfEvaluation?: string | null
}

/** Fields a group admin / system admin can update. */
export interface PbcRowAdminUpdate extends PbcRowProgressUpdate {
  managerEvaluation?: string | null
  code?: string | null
  annualTarget?: string | null
  weightPercent?: number | null
  evaluationPeriod?: string | null
  title?: string | null
  milestones?: PbcMilestone[] | null
}

/** Input for creating or upserting a pbc_document. */
export interface PbcDocumentInput {
  groupId: string
  scope: PbcScope
  subjectUserId?: string | null
  fiscalYear: number
  periodMonth: number
  validFrom?: string | null
  validTo?: string | null
  committerDisplayName?: string | null
  departmentLabel?: string | null
  positionLabel?: string | null
  overallDirection?: string | null
}
