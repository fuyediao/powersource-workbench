import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  BrainIcon,
  CalendarIcon,
  CloseIcon,
  CurrencyIcon,
  GridIcon,
  LucideBuilding2Icon,
  LucideClipboardListIcon,
  LucideHandshakeIcon,
  LucideListIcon,
  LucideMegaphoneIcon,
  LucidePackageIcon,
  LucideTargetIcon,
  LucideUsersIcon,
  MailIcon,
  MapIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TrendIcon,
} from '@/icons/AllIcons'
import {
  CUSTOM_ASSISTANT_INSTRUCTIONS,
  SALES_ASSISTANTS,
  type BuiltInSalesAssistant,
  type SalesAssistantCategory,
  type SalesAssistantIcon,
  type SalesAssistantProfile,
  type SalesAssistantOutputMode,
  type SalesAssistantToolCapability,
  resolveSalesAssistantManifest,
  salesAssistantExecutorName,
} from '@/constants/harness-sales-assistants'
import type { ElectronAiModelSelection } from '@/chat/ai-model-catalog'
import { generateHarnessTool } from '@/services/harness-tool-generator'
import {
  fetchHarnessExperts,
  saveHarnessExpert,
  type HarnessCloudExpert,
} from '@/services/harness-experts-api'

const CUSTOM_ASSISTANTS_KEY = 'workbench.electron.harness.salesAssistants.v1'
const CATEGORY_ORDER: readonly SalesAssistantCategory[] = [
  'productDesign',
  'technicalEngineering',
  'financialInvestment',
  'gameSpace',
  'dataIntelligence',
  'marketingGrowth',
  'contentCreation',
  'salesBusiness',
  'operationsHuman',
  'projectQuality',
  'legalSecurity',
  'industryAdvisory',
]
const FEATURED_SCENES: ReadonlyArray<{
  category: SalesAssistantCategory
  assistantIds: readonly string[]
  className: string
}> = [
  { category: 'contentCreation', assistantIds: ['contentCreator', 'shortVideoCoach', 'presentationExpert'], className: 'from-sky-100 via-white to-blue-100 dark:from-sky-950 dark:via-zinc-900 dark:to-blue-950' },
  { category: 'financialInvestment', assistantIds: ['stockResearcher', 'investmentRiskAnalyst', 'financeOpsAdvisor'], className: 'from-emerald-100 via-white to-teal-100 dark:from-emerald-950 dark:via-zinc-900 dark:to-teal-950' },
  { category: 'legalSecurity', assistantIds: ['legalComplianceReviewer', 'contractAdvisor', 'threatDetectionEngineer'], className: 'from-amber-100 via-white to-orange-100 dark:from-amber-950 dark:via-zinc-900 dark:to-orange-950' },
  { category: 'industryAdvisory', assistantIds: ['smallBusinessCoach', 'entrepreneurshipCoach', 'trendAdvisor'], className: 'from-violet-100 via-white to-fuchsia-100 dark:from-violet-950 dark:via-zinc-900 dark:to-fuchsia-950' },
]
type ExpertKind = 'expert' | 'team'
type ExpertSort = 'recommended' | 'popular' | 'newest'

interface StoredSalesAssistant {
  id: string
  name: string
  description: string
  category: SalesAssistantCategory
  createdAt: string
  instructions: string
  allowedTools: SalesAssistantToolCapability[]
  requiredConnectors: string[]
  outputMode: SalesAssistantOutputMode
}

interface HarnessToolsPanelProps {
  onStartAssistant: (assistant: SalesAssistantProfile) => void
  selection: ElectronAiModelSelection
  canGenerate: boolean
}
const EXTRA_TEAM_DEFINITIONS: ReadonlyArray<{ id: string; category: SalesAssistantCategory }> = [
  { id: 'contentDistribution', category: 'contentCreation' },
  { id: 'onePersonCompany', category: 'industryAdvisory' },
  { id: 'contentMonetization', category: 'marketingGrowth' },
  { id: 'seoMarketing', category: 'marketingGrowth' },
  { id: 'socialGrowth', category: 'marketingGrowth' },
  { id: 'professionalDocuments', category: 'contentCreation' },
  { id: 'productStrategy', category: 'productDesign' },
  { id: 'deepResearch', category: 'dataIntelligence' },
] as const

/**
 * Resolves an expert icon token through the shared icon library.
 * @param icon - Stable expert icon token.
 * @returns Shared icon component.
 */
function assistantIcon(icon: SalesAssistantIcon) {
  const icons = {
    target: LucideTargetIcon,
    building: LucideBuilding2Icon,
    users: LucideUsersIcon,
    mail: MailIcon,
    phone: PhoneIcon,
    calendar: CalendarIcon,
    handshake: LucideHandshakeIcon,
    clipboard: LucideClipboardListIcon,
    trend: TrendIcon,
    brain: BrainIcon,
    currency: CurrencyIcon,
    map: MapIcon,
    megaphone: LucideMegaphoneIcon,
    list: LucideListIcon,
    package: LucidePackageIcon,
  }
  return icons[icon]
}

/**
 * Reads valid legacy locally created experts for one-time cloud migration.
 * @returns Saved expert rows.
 */
function loadCustomAssistants(): StoredSalesAssistant[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ASSISTANTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value): StoredSalesAssistant[] => {
      if (!value || typeof value !== 'object') return []
      const row = value as Record<string, unknown>
      if (
        typeof row.id !== 'string' ||
        typeof row.name !== 'string' ||
        typeof row.description !== 'string' ||
        typeof row.createdAt !== 'string' ||
        !CATEGORY_ORDER.some((category) => category === row.category)
      ) return []
      return [{
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        category: row.category as SalesAssistantCategory,
        instructions: typeof row.instructions === 'string'
          ? row.instructions
          : CUSTOM_ASSISTANT_INSTRUCTIONS[row.category as SalesAssistantCategory],
        ...(() => {
          const manifest = resolveSalesAssistantManifest({
          category: row.category as SalesAssistantCategory,
          allowedTools: Array.isArray(row.allowedTools)
            ? row.allowedTools.filter((tool): tool is SalesAssistantToolCapability => typeof tool === 'string')
            : undefined,
          requiredConnectors: Array.isArray(row.requiredConnectors)
            ? row.requiredConnectors.filter((id): id is string => typeof id === 'string')
            : undefined,
          outputMode: typeof row.outputMode === 'string'
            ? row.outputMode as SalesAssistantOutputMode
            : undefined,
          })
          return {
            allowedTools: [...manifest.allowedTools],
            requiredConnectors: [...manifest.requiredConnectors],
            outputMode: manifest.outputMode,
          }
        })(),
      }]
    })
  } catch {
    return []
  }
}

/**
 * Adds localized display copy to one built-in expert.
 * @param assistant - Built-in expert definition.
 * @param translate - i18n translation function.
 * @returns Display-ready expert profile.
 */
function localizeBuiltIn(
  assistant: BuiltInSalesAssistant,
  translate: (key: string) => string,
): SalesAssistantProfile {
  return {
    ...assistant,
    ...resolveSalesAssistantManifest(assistant),
    name: translate(`harness.tools.assistant.${assistant.id}.name`),
    description: translate(`harness.tools.assistant.${assistant.id}.description`),
    creator: 'Workbench',
    custom: false,
    executorName: salesAssistantExecutorName(assistant.id),
  }
}

/**
 * Converts one local expert row into a runnable profile.
 * @param assistant - Saved expert row.
 * @returns Runnable expert profile.
 */
function customProfile(assistant: StoredSalesAssistant): SalesAssistantProfile {
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    category: assistant.category,
    creator: 'user',
    custom: true,
    featured: false,
    icon: 'target',
    accentClassName: 'bg-linear-to-br from-zinc-700 to-zinc-950 text-white',
    instructions: assistant.instructions,
    allowedTools: assistant.allowedTools,
    requiredConnectors: assistant.requiredConnectors,
    outputMode: assistant.outputMode,
    executorName: salesAssistantExecutorName(assistant.id),
  }
}

/**
 * Creates a runnable coordinated tool group.
 * @param teamId - Stable tool-group identifier.
 * @param category - Sales workflow category.
 * @param translate - i18n translation function.
 * @returns Runnable tool-group profile.
 */
function teamProfile(
  teamId: string,
  category: SalesAssistantCategory,
  translate: (key: string) => string,
): SalesAssistantProfile {
  const representative = SALES_ASSISTANTS.find((assistant) => assistant.category === category) ?? SALES_ASSISTANTS[0]
  return {
    ...representative,
    id: `team-${teamId}`,
    name: translate(`harness.tools.team.${teamId}.name`),
    description: translate(`harness.tools.team.${teamId}.description`),
    creator: 'Workbench',
    custom: false,
    featured: false,
    instructions: `Act as a coordinated AI tool group for ${category}. Combine specialist capabilities, reconcile conflicts, and return one evidence-based plan with owners, risks, and next actions.`,
    ...resolveSalesAssistantManifest(representative),
    executorName: salesAssistantExecutorName(`team-${teamId}`),
  }
}

/**
 * Renders one circular expert identity.
 * @param props - Expert profile and size class.
 * @returns Expert avatar.
 */
function AssistantAvatar({ assistant, className }: { assistant: SalesAssistantProfile; className: string }) {
  const Icon = assistantIcon(assistant.icon)
  return <span className={`flex shrink-0 items-center justify-center rounded-full shadow-sm ${assistant.accentClassName} ${className}`}><Icon className="size-1/2" aria-hidden /></span>
}

/**
 * Renders one WorkBuddy-style expert card.
 * @param props - Expert content and start action.
 * @returns Expert card.
 */
function ExpertCard({ assistant, creatorLabel, tags, onOpen }: {
  assistant: SalesAssistantProfile
  creatorLabel: string
  tags: readonly string[]
  onOpen: () => void
}) {
  return (
    <button type="button" data-testid="harness-expert-card" data-executor={assistant.executorName} className="group min-h-42 rounded-2xl border border-zinc-950/10 bg-white/75 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg dark:border-white/10 dark:bg-white/5" onClick={onOpen}>
      <span className="flex items-center gap-3">
        <AssistantAvatar assistant={assistant} className="size-11" />
        <span className="min-w-0"><span className="block truncate text-sm font-extrabold text-ink">{assistant.name}</span><span className="mt-0.5 block truncate text-xs font-semibold text-muted">{creatorLabel}</span></span>
        <span className="ml-auto grid size-8 shrink-0 place-items-center rounded-full bg-zinc-950/5 text-muted transition group-hover:bg-brand group-hover:text-brand-fg dark:bg-white/10"><PlusIcon className="size-4" aria-hidden /></span>
      </span>
      <span className="mt-3 line-clamp-2 block text-xs leading-5 text-muted">{assistant.description}</span>
      <span className="mt-4 flex flex-wrap gap-1.5">{tags.map((tag) => <span key={tag} className="rounded-md bg-zinc-950/5 px-2 py-1 text-[10px] font-bold text-muted dark:bg-white/10">{tag}</span>)}</span>
    </button>
  )
}

/**
 * Displays the WorkBuddy-inspired expert marketplace.
 * @param props - Task launch callbacks.
 * @returns Expert marketplace.
 */
export function HarnessToolsPanel({ onStartAssistant, selection, canGenerate }: HarnessToolsPanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<SalesAssistantCategory | 'all'>('all')
  const [expertKind, setExpertKind] = useState<ExpertKind>('expert')
  const [expertSort, setExpertSort] = useState<ExpertSort>('recommended')
  const [showMine, setShowMine] = useState(false)
  const [customAssistants, setCustomAssistants] = useState<StoredSalesAssistant[]>([])
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftCategory, setDraftCategory] = useState<SalesAssistantCategory>('salesBusiness')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationFailed, setGenerationFailed] = useState(false)
  const builtInProfiles = useMemo(() => SALES_ASSISTANTS.map((assistant) => localizeBuiltIn(assistant, t)), [t])
  const customProfiles = useMemo(() => customAssistants.map(customProfile), [customAssistants])
  const teamProfiles = useMemo(() => [
    ...CATEGORY_ORDER.map((category) => teamProfile(category, category, t)),
    ...EXTRA_TEAM_DEFINITIONS.map((team) => teamProfile(team.id, team.category, t)),
  ], [t])
  const normalizedQuery = query.trim().toLocaleLowerCase()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cloud = await fetchHarnessExperts()
        const known = new Set(cloud.map((expert) => expert.id))
        const legacy = loadCustomAssistants().filter((expert) => !known.has(expert.id))
        const migrated = await Promise.all(legacy.map((expert) => saveHarnessExpert({
          ...expert,
          allowedTools: [...expert.allowedTools],
          requiredConnectors: [...expert.requiredConnectors],
        })))
        if (!cancelled) setCustomAssistants([...migrated, ...cloud])
        if (migrated.length > 0 || cloud.length > 0) localStorage.removeItem(CUSTOM_ASSISTANTS_KEY)
      } catch {
        if (!cancelled) setCustomAssistants(loadCustomAssistants())
      }
    })()
    return () => { cancelled = true }
  }, [])

  const sourceExperts = useMemo(
    () => expertKind === 'team' ? teamProfiles : [...builtInProfiles, ...customProfiles],
    [builtInProfiles, customProfiles, expertKind, teamProfiles],
  )
  const filteredExperts = useMemo(() => {
    const source = showMine ? customProfiles : sourceExperts
    const categoryRows = activeCategory === 'all' ? source : source.filter((assistant) => assistant.category === activeCategory)
    const rows = normalizedQuery ? categoryRows.filter((assistant) => `${assistant.name} ${assistant.description}`.toLocaleLowerCase().includes(normalizedQuery)) : categoryRows
    if (expertSort === 'newest') return [...rows].reverse()
    if (expertSort === 'popular') return [...rows].sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)))
    return rows
  }, [activeCategory, customProfiles, expertSort, normalizedQuery, showMine, sourceExperts])

  /**
   * Saves the current tool draft to the signed-in cloud profile.
   * @returns Nothing.
   */
  const createAssistant = async (): Promise<void> => {
    const name = draftName.trim()
    const description = draftDescription.trim()
    if (!name || !description) return
    const manifest = resolveSalesAssistantManifest({ category: draftCategory })
    const expert: HarnessCloudExpert = {
      id: `custom-${crypto.randomUUID()}`,
      name,
      description,
      category: draftCategory,
      createdAt: new Date().toISOString(),
      instructions: CUSTOM_ASSISTANT_INSTRUCTIONS[draftCategory],
      allowedTools: [...manifest.allowedTools],
      requiredConnectors: [...manifest.requiredConnectors],
      outputMode: manifest.outputMode,
    }
    try {
      const saved = await saveHarnessExpert(expert)
      setCustomAssistants((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setCreatorOpen(false)
      setShowMine(true)
    } catch {
      setGenerationFailed(true)
    }
  }

  /**
   * Starts an AI-assisted tool design task with the selected model.
   * @returns Nothing.
   */
  const buildWithAi = async (): Promise<void> => {
    if (!canGenerate || isGenerating) return
    const name = draftName.trim() || 'New tool'
    const details = draftDescription.trim() || 'Ask me for the industry context, required capabilities, workflow, and safety boundaries.'
    setIsGenerating(true)
    setGenerationFailed(false)
    try {
      const generated = await generateHarnessTool(draftCategory, name, details, selection)
      const expert: HarnessCloudExpert = {
        id: `custom-${crypto.randomUUID()}`,
        category: draftCategory,
        createdAt: new Date().toISOString(),
        ...generated,
      }
      const saved = await saveHarnessExpert(expert)
      setCustomAssistants((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setDraftName('')
      setDraftDescription('')
      setCreatorOpen(false)
      setShowMine(true)
    } catch {
      setGenerationFailed(true)
    } finally {
      setIsGenerating(false)
    }
  }

  const creatorLabel = (assistant: SalesAssistantProfile): string => assistant.creator === 'user' ? t('harness.tools.creator.you') : t('harness.tools.creator.workbench')

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 lg:px-8">
      <div className="mx-auto w-full max-w-6xl pb-14">
        {showMine ? <MyExperts profiles={customProfiles} t={t} creatorLabel={creatorLabel} onBack={() => setShowMine(false)} onCreate={() => setCreatorOpen(true)} onStart={onStartAssistant} /> : <>
          <section>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mr-auto text-2xl font-black text-ink">{t('harness.tools.featuredScenes')}</h1>
              <label className="relative min-w-56 flex-1 sm:max-w-xs"><SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('harness.tools.search.experts')} className="h-10 w-full rounded-xl border border-zinc-950/10 bg-white/75 pr-3 pl-10 text-sm font-medium text-ink outline-none transition placeholder:text-muted focus:border-brand/50 focus:ring-3 focus:ring-brand/10 dark:border-white/10 dark:bg-white/5" /></label>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-950/10 bg-white/75 px-4 text-sm font-bold text-ink shadow-sm dark:border-white/10 dark:bg-white/5" onClick={() => setShowMine(true)}><GridIcon className="size-4" aria-hidden />{t('harness.tools.myExperts')}</button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-bold text-white dark:bg-white dark:text-zinc-950" onClick={() => setCreatorOpen(true)}><SparklesIcon className="size-4" aria-hidden />{t('harness.tools.createExpert')}</button>
            </div>
            {!normalizedQuery ? <FeaturedScenes profiles={builtInProfiles} t={t} onStart={onStartAssistant} /> : null}
          </section>
          <section className="mt-9">
            <div className="flex flex-wrap items-center gap-3"><div className="flex gap-4">{(['expert', 'team'] as const).map((kind) => <button key={kind} type="button" className={`text-xl font-black transition ${expertKind === kind ? 'text-ink' : 'text-muted/60'}`} onClick={() => setExpertKind(kind)}>{t(`harness.tools.expertKind.${kind}`)}</button>)}</div><div className="ml-auto flex rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">{(['recommended', 'popular', 'newest'] as const).map((sort) => <button key={sort} type="button" className={`rounded-md px-3 py-1.5 text-xs font-bold ${expertSort === sort ? 'bg-white text-ink shadow-sm dark:bg-zinc-800' : 'text-muted'}`} onClick={() => setExpertSort(sort)}>{t(`harness.tools.sort.${sort}`)}</button>)}</div></div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{(['all', ...CATEGORY_ORDER] as const).map((category) => <button key={category} type="button" className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-bold transition ${activeCategory === category ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950' : 'bg-zinc-950/5 text-muted hover:text-ink dark:bg-white/5'}`} onClick={() => setActiveCategory(category)}>{t(`harness.tools.category.${category}`)}</button>)}</div>
            {filteredExperts.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{filteredExperts.map((assistant) => <ExpertCard key={assistant.id} assistant={assistant} creatorLabel={creatorLabel(assistant)} tags={[t(`harness.tools.category.${assistant.category}`), t(`harness.tools.tags.${assistant.category}.one`), t(`harness.tools.tags.${assistant.category}.two`)]} onOpen={() => onStartAssistant(assistant)} />)}</div> : <p className="py-20 text-center text-sm font-semibold text-muted">{t('harness.tools.emptySearch')}</p>}
          </section>
        </>}
      </div>
      {creatorOpen ? <ExpertCreator name={draftName} description={draftDescription} category={draftCategory} t={t} canGenerate={canGenerate} isGenerating={isGenerating} generationFailed={generationFailed} onNameChange={setDraftName} onDescriptionChange={setDraftDescription} onCategoryChange={setDraftCategory} onClose={() => setCreatorOpen(false)} onBuild={() => void buildWithAi()} onSave={() => void createAssistant()} /> : null}
    </main>
  )
}

/**
 * Renders the featured expert scenario carousel.
 * @param props - Profiles, localized copy, and card action.
 * @returns Featured scenario carousel.
 */
function FeaturedScenes({ profiles, t, onStart }: { profiles: SalesAssistantProfile[]; t: (key: string) => string; onStart: (profile: SalesAssistantProfile) => void }) {
  return <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">{FEATURED_SCENES.map((scene) => <article key={scene.category} className={`min-w-[280px] flex-1 snap-start rounded-2xl border border-zinc-950/10 bg-linear-to-br p-5 ${scene.className} dark:border-white/10`}><h2 className="text-lg font-black text-ink">{t(`harness.tools.scene.${scene.category}`)}</h2><div className="mt-4 space-y-2">{scene.assistantIds.map((id) => { const profile = profiles.find((item) => item.id === id); return profile ? <button key={id} type="button" className="flex w-full items-center gap-2 rounded-xl bg-white/55 px-2.5 py-2 text-left text-xs font-bold text-ink transition hover:bg-white dark:bg-black/20" onClick={() => onStart(profile)}><AssistantAvatar assistant={profile} className="size-7" /><span className="truncate">{profile.name}</span></button> : null })}</div></article>)}</div>
}

/**
 * Renders the user's locally created expert collection.
 * @param props - Profiles, localized copy, and collection actions.
 * @returns Personal expert collection.
 */
function MyExperts({ profiles, t, creatorLabel, onBack, onCreate, onStart }: { profiles: SalesAssistantProfile[]; t: (key: string) => string; creatorLabel: (profile: SalesAssistantProfile) => string; onBack: () => void; onCreate: () => void; onStart: (profile: SalesAssistantProfile) => void }) {
  return <section className="mt-10"><button type="button" className="text-sm font-bold text-muted hover:text-ink" onClick={onBack}>← {t('harness.tools.allExperts')}</button>{profiles.length === 0 ? <div className="mt-24 text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-zinc-950/5 text-ink dark:bg-white/10"><BrainIcon className="size-8" aria-hidden /></span><h2 className="mt-5 text-xl font-black text-ink">{t('harness.tools.emptyMine')}</h2><p className="mt-2 text-sm text-muted">{t('harness.tools.emptyMineHint')}</p><button type="button" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-zinc-950" onClick={onCreate}><PlusIcon className="size-4" aria-hidden />{t('harness.tools.createExpert')}</button></div> : <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{profiles.map((profile) => <ExpertCard key={profile.id} assistant={profile} creatorLabel={creatorLabel(profile)} tags={[t(`harness.tools.category.${profile.category}`), t('harness.tools.customTag')]} onOpen={() => onStart(profile)} />)}</div>}</section>
}

/**
 * Renders manual and AI-assisted expert creation controls.
 * @param props - Draft values and creation actions.
 * @returns Expert creation dialog.
 */
function ExpertCreator({ name, description, category, t, canGenerate, isGenerating, generationFailed, onNameChange, onDescriptionChange, onCategoryChange, onClose, onBuild, onSave }: { name: string; description: string; category: SalesAssistantCategory; t: (key: string) => string; canGenerate: boolean; isGenerating: boolean; generationFailed: boolean; onNameChange: (value: string) => void; onDescriptionChange: (value: string) => void; onCategoryChange: (value: SalesAssistantCategory) => void; onClose: () => void; onBuild: () => void; onSave: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="w-full max-w-lg rounded-3xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900" role="dialog" aria-modal="true" aria-labelledby="sales-expert-creator-title"><div className="flex items-start justify-between gap-4"><div><h2 id="sales-expert-creator-title" className="text-2xl font-black text-ink">{t('harness.tools.creatorForm.title')}</h2><p className="mt-1 text-sm text-muted">{t('harness.tools.creatorForm.subtitle')}</p></div><button type="button" className="grid size-9 place-items-center rounded-full text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10" aria-label={t('harness.tools.creatorForm.close')} onClick={onClose}><CloseIcon className="size-4" aria-hidden /></button></div><div className="mt-6 space-y-4"><label className="block"><span className="text-sm font-bold text-ink">{t('harness.tools.creatorForm.name')}</span><input type="text" value={name} className="mt-2 h-11 w-full rounded-xl border border-zinc-950/15 bg-transparent px-3 text-sm text-ink outline-none focus:border-brand/50 dark:border-white/15" placeholder={t('harness.tools.creatorForm.namePlaceholder')} onChange={(event) => onNameChange(event.target.value)} /></label><label className="block"><span className="text-sm font-bold text-ink">{t('harness.tools.creatorForm.description')}</span><textarea rows={4} value={description} className="mt-2 w-full resize-none rounded-xl border border-zinc-950/15 bg-transparent px-3 py-2.5 text-sm text-ink outline-none focus:border-brand/50 dark:border-white/15" placeholder={t('harness.tools.creatorForm.descriptionPlaceholder')} onChange={(event) => onDescriptionChange(event.target.value)} /></label><div className="block"><span className="text-sm font-bold text-ink">{t('harness.tools.creatorForm.category')}</span><CrmFilterSelect value={category} options={CATEGORY_ORDER.map((item) => ({ value: item, label: t(`harness.tools.category.${item}`) }))} className="mt-2" ariaLabel={t('harness.tools.creatorForm.category')} menuPlacement="top" onChange={(value) => onCategoryChange(value as SalesAssistantCategory)} /></div>{generationFailed ? <p className="text-xs font-semibold text-red-600">{t('harness.tools.creatorForm.generationFailed')}</p> : null}</div><div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted" onClick={onClose}>{t('harness.tools.creatorForm.cancel')}</button><button type="button" disabled={!canGenerate || isGenerating} className="inline-flex items-center gap-2 rounded-xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-40" onClick={onBuild}><SparklesIcon className="size-4" aria-hidden />{isGenerating ? t('harness.tools.creatorForm.generating') : t('harness.tools.creatorForm.buildWithAi')}</button><button type="button" disabled={!name.trim() || !description.trim()} className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950" onClick={onSave}>{t('harness.tools.creatorForm.save')}</button></div></div></div>
}
