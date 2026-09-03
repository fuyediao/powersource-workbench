/** Four BSC dimensions (must match DB CHECK constraint). */
export type BscDimension = 'financial' | 'customer' | 'internal' | 'learning'

/** A KPI indicator attached to a strategic goal. */
export interface BscKpi {
  id: string
  goalId: string
  name: string
  formula: string | null
  targetValue: string | null
  currentValue: string | null
  dataSource: string | null
  weightPercent: number | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** A strategic objective in one BSC dimension. */
export interface BscGoal {
  id: string
  documentId: string
  dimension: BscDimension
  name: string
  description: string | null
  weightPercent: number | null
  responsibility: string | null
  sortOrder: number
  kpis: BscKpi[]
  createdAt: string
  updatedAt: string
}

/** BSC document for one group + year + month. */
export interface BscDocument {
  id: string
  groupId: string
  fiscalYear: number
  periodMonth: number
  strategicVision: string | null
  strategicDescription: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
  goals: BscGoal[]
}

/** Input for upserting a BSC goal (id present = update). */
export interface BscGoalInput {
  id?: string
  documentId: string
  dimension: BscDimension
  name: string
  description?: string | null
  weightPercent?: number | null
  responsibility?: string | null
  sortOrder?: number
}

/** Input for upserting a BSC KPI (id present = update). */
export interface BscKpiInput {
  id?: string
  goalId: string
  name: string
  formula?: string | null
  targetValue?: string | null
  currentValue?: string | null
  dataSource?: string | null
  weightPercent?: number | null
  sortOrder?: number
}
