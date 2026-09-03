/** Sales workflow categories exposed by the Harness assistant catalog. */
export type SalesAssistantCategory =
  | 'productDesign'
  | 'technicalEngineering'
  | 'financialInvestment'
  | 'gameSpace'
  | 'dataIntelligence'
  | 'marketingGrowth'
  | 'contentCreation'
  | 'salesBusiness'
  | 'operationsHuman'
  | 'projectQuality'
  | 'legalSecurity'
  | 'industryAdvisory'

/** Icon token resolved through the shared application icon library. */
export type SalesAssistantIcon =
  | 'target'
  | 'building'
  | 'users'
  | 'mail'
  | 'phone'
  | 'calendar'
  | 'handshake'
  | 'clipboard'
  | 'trend'
  | 'brain'
  | 'currency'
  | 'map'
  | 'megaphone'
  | 'list'
  | 'package'

/** First-party capability names a reusable Harness tool may receive. */
export type SalesAssistantToolCapability =
  | 'computer_use'
  | 'web_search'
  | 'read_harness_resource'
  | 'search_harness_sessions'
  | 'list_my_access'
  | 'list_entities'
  | 'search_records'
  | 'get_record'
  | 'count_records'
  | 'summarize_records'
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'inspect_local_office_file'
  | 'edit_local_office_file'
  | 'create_local_office_file'
  | 'list_office_files'
  | 'open_office_file'

/** Presentation contract requested from one reusable Harness tool. */
export type SalesAssistantOutputMode = 'narrative' | 'table' | 'dashboard' | 'document'

/** One built-in assistant whose visible copy comes from i18n. */
export interface BuiltInSalesAssistant {
  id: string
  category: SalesAssistantCategory
  icon: SalesAssistantIcon
  accentClassName: string
  featured?: boolean
  instructions: string
  allowedTools?: readonly SalesAssistantToolCapability[]
  requiredConnectors?: readonly string[]
  outputMode?: SalesAssistantOutputMode
}

/** One assistant ready to display and start. */
export interface SalesAssistantProfile extends BuiltInSalesAssistant {
  name: string
  description: string
  creator: 'GeoCRM' | 'user'
  custom: boolean
  allowedTools: readonly SalesAssistantToolCapability[]
  requiredConnectors: readonly string[]
  outputMode: SalesAssistantOutputMode
  /** Unique dynamic tool identity advertised when this profile is active. */
  executorName: string
}

/** Returns the stable dynamic tool name for one built-in or custom profile. */
export function salesAssistantExecutorName(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  return `expert_${normalized || 'custom'}`
}

const READ_TOOLS: readonly SalesAssistantToolCapability[] = [
  'web_search',
  'read_harness_resource',
  'search_harness_sessions',
  'list_my_access',
  'list_entities',
  'search_records',
  'get_record',
  'count_records',
  'summarize_records',
  'inspect_local_office_file',
  'list_office_files',
  'open_office_file',
]

/**
 * Resolves the executable manifest for a built-in or locally created tool.
 * @param assistant - Tool metadata and optional explicit overrides.
 * @returns Required runtime capabilities and output contract.
 */
export function resolveSalesAssistantManifest(
  assistant: Pick<BuiltInSalesAssistant, 'category' | 'allowedTools' | 'requiredConnectors' | 'outputMode'>,
): Pick<SalesAssistantProfile, 'allowedTools' | 'requiredConnectors' | 'outputMode'> {
  const allowsWrites = assistant.category === 'operationsHuman'
    || assistant.category === 'projectQuality'
    || assistant.category === 'salesBusiness'
  const defaultOutput: SalesAssistantOutputMode =
    assistant.category === 'dataIntelligence' || assistant.category === 'financialInvestment'
      ? 'dashboard'
      : assistant.category === 'contentCreation'
        ? 'document'
        : 'table'
  return {
    allowedTools: assistant.allowedTools ?? [
      ...READ_TOOLS,
      'edit_local_office_file',
      'create_local_office_file',
      ...(allowsWrites ? ['create_record', 'update_record'] as const : []),
    ],
    requiredConnectors: assistant.requiredConnectors ?? [],
    outputMode: assistant.outputMode ?? defaultOutput,
  }
}

/** Built-in assistants ordered by category ranking. */
const BASE_SALES_ASSISTANTS: readonly BuiltInSalesAssistant[] = [
  {
    id: 'leadResearcher',
    category: 'salesBusiness',
    icon: 'target',
    accentClassName: 'bg-linear-to-br from-blue-500 to-indigo-700 text-white',
    instructions: 'Act as a sales lead research specialist. Use available CRM and connected sources to build concise, evidence-based prospect briefs. Separate verified facts from assumptions and recommend the next research step.',
  },
  {
    id: 'targetAccountFinder',
    category: 'salesBusiness',
    icon: 'building',
    accentClassName: 'bg-linear-to-br from-cyan-500 to-blue-700 text-white',
    instructions: 'Act as a target account discovery specialist. Help define practical account criteria, compare candidates, and rank opportunities with transparent reasoning. Ask for missing territory, segment, and product constraints.',
  },
  {
    id: 'idealCustomerProfiler',
    category: 'salesBusiness',
    icon: 'users',
    accentClassName: 'bg-linear-to-br from-violet-500 to-indigo-700 text-white',
    instructions: 'Act as an ideal customer profile strategist. Turn CRM evidence into clear firmographic, behavioral, and buying-signal criteria. Highlight exclusions and avoid inventing customer data.',
  },
  {
    id: 'prospectQualifier',
    category: 'salesBusiness',
    icon: 'clipboard',
    accentClassName: 'bg-linear-to-br from-emerald-500 to-teal-700 text-white',
    instructions: 'Act as a prospect qualification coach. Evaluate fit, need, authority, urgency, and risk from the provided evidence. Return a concise qualification summary and specific questions for the next conversation.',
  },
  {
    id: 'territoryPlanner',
    category: 'salesBusiness',
    icon: 'map',
    accentClassName: 'bg-linear-to-br from-orange-500 to-amber-600 text-white',
    instructions: 'Act as a sales territory planning assistant. Organize accounts by geography, potential, coverage cost, and priority. Make assumptions explicit and propose an actionable visit or outreach sequence.',
  },
  {
    id: 'competitorScout',
    category: 'salesBusiness',
    icon: 'brain',
    accentClassName: 'bg-linear-to-br from-rose-500 to-red-700 text-white',
    instructions: 'Act as a competitive sales intelligence assistant. Compare competitors, positioning, pricing signals, and likely objections using available evidence. Identify gaps instead of guessing.',
  },
  {
    id: 'account360',
    category: 'salesBusiness',
    icon: 'building',
    accentClassName: 'bg-linear-to-br from-sky-500 to-blue-700 text-white',
    featured: true,
    instructions: 'Act as an account intelligence copilot. Build a 360-degree customer view from CRM records, interactions, opportunities, orders, and connected sources. Surface changes, risks, opportunities, and the next best action with citations to available evidence.',
  },
  {
    id: 'customerInsightAnalyst',
    category: 'salesBusiness',
    icon: 'brain',
    accentClassName: 'bg-linear-to-br from-fuchsia-500 to-purple-700 text-white',
    instructions: 'Act as a customer insight analyst. Find meaningful patterns in customer history and explain what they imply for retention, growth, and service. Distinguish correlation from evidence-backed conclusions.',
  },
  {
    id: 'relationshipMapper',
    category: 'salesBusiness',
    icon: 'users',
    accentClassName: 'bg-linear-to-br from-indigo-500 to-violet-700 text-white',
    instructions: 'Act as a stakeholder and relationship mapping assistant. Identify known roles, influence, sentiment, gaps, and engagement strategy. Never infer personal attributes that are not present in the source data.',
  },
  {
    id: 'visitBriefing',
    category: 'salesBusiness',
    icon: 'calendar',
    accentClassName: 'bg-linear-to-br from-amber-500 to-orange-700 text-white',
    instructions: 'Act as a customer visit briefing assistant. Prepare a short pre-meeting brief with context, open items, recent activity, goals, questions, and risks. Optimize it for quick review before a sales visit.',
  },
  {
    id: 'customerHealthMonitor',
    category: 'salesBusiness',
    icon: 'trend',
    accentClassName: 'bg-linear-to-br from-emerald-500 to-green-700 text-white',
    instructions: 'Act as a customer health analyst. Evaluate engagement, order, opportunity, support, and follow-up signals. Explain the evidence behind each health indicator and propose proportionate interventions.',
  },
  {
    id: 'renewalRiskAnalyst',
    category: 'salesBusiness',
    icon: 'trend',
    accentClassName: 'bg-linear-to-br from-red-500 to-rose-700 text-white',
    instructions: 'Act as a renewal and retention risk analyst. Identify warning signals, missing evidence, stakeholder risks, and recovery actions. Avoid false certainty and prioritize actions by urgency and expected impact.',
  },
  {
    id: 'salesEmailWriter',
    category: 'marketingGrowth',
    icon: 'mail',
    accentClassName: 'bg-linear-to-br from-blue-500 to-cyan-700 text-white',
    instructions: 'Act as a B2B sales email writer. Draft concise, specific, respectful emails grounded in the supplied customer context. Avoid unsupported claims, manipulative language, and generic filler. Offer subject line options when useful.',
  },
  {
    id: 'followUpCoach',
    category: 'marketingGrowth',
    icon: 'phone',
    accentClassName: 'bg-linear-to-br from-orange-500 to-red-600 text-white',
    featured: true,
    instructions: 'Act as a sales follow-up coach. Review the situation, recommend timing and channel, then draft a concise follow-up that adds value. Adapt to the relationship stage and do not pressure the recipient.',
  },
  {
    id: 'meetingAgendaBuilder',
    category: 'marketingGrowth',
    icon: 'calendar',
    accentClassName: 'bg-linear-to-br from-violet-500 to-purple-700 text-white',
    instructions: 'Act as a sales meeting agenda builder. Create a focused agenda with desired outcomes, discovery questions, decision points, owners, and timing. Tailor it to the account and opportunity context provided.',
  },
  {
    id: 'objectionCoach',
    category: 'marketingGrowth',
    icon: 'handshake',
    accentClassName: 'bg-linear-to-br from-emerald-500 to-teal-700 text-white',
    instructions: 'Act as a sales objection handling coach. Help understand the concern before answering it. Produce empathetic, evidence-based responses and useful follow-up questions without dismissing or overpowering the customer.',
  },
  {
    id: 'multilingualOutreach',
    category: 'marketingGrowth',
    icon: 'megaphone',
    accentClassName: 'bg-linear-to-br from-pink-500 to-fuchsia-700 text-white',
    instructions: 'Act as a multilingual B2B outreach editor. Translate and localize sales communication while preserving facts, tone, and intent. Flag culturally sensitive phrasing and never add claims absent from the source.',
  },
  {
    id: 'socialMessageWriter',
    category: 'marketingGrowth',
    icon: 'users',
    accentClassName: 'bg-linear-to-br from-sky-500 to-indigo-700 text-white',
    instructions: 'Act as a professional social outreach writer. Create short, personalized connection and follow-up messages based only on supplied context. Keep the tone helpful, credible, and appropriate for the platform.',
  },
  {
    id: 'opportunityStrategist',
    category: 'salesBusiness',
    icon: 'handshake',
    accentClassName: 'bg-linear-to-br from-emerald-500 to-cyan-700 text-white',
    featured: true,
    instructions: 'Act as an opportunity strategy copilot. Analyze the deal stage, customer needs, stakeholders, competition, evidence, and risks. Recommend a concrete next-step plan with owners, deadlines, and measurable exit criteria.',
  },
  {
    id: 'quoteAssistant',
    category: 'salesBusiness',
    icon: 'currency',
    accentClassName: 'bg-linear-to-br from-amber-500 to-yellow-700 text-white',
    instructions: 'Act as a sales quotation assistant. Help structure a clear quote, verify assumptions, identify missing commercial details, and explain options. Do not invent prices, discounts, taxes, terms, or approvals.',
  },
  {
    id: 'proposalBuilder',
    category: 'salesBusiness',
    icon: 'package',
    accentClassName: 'bg-linear-to-br from-indigo-500 to-blue-700 text-white',
    instructions: 'Act as a B2B proposal builder. Turn verified requirements and product information into a customer-centered proposal with outcomes, scope, assumptions, implementation, and next steps. Mark unknown details clearly.',
  },
  {
    id: 'dealRiskReviewer',
    category: 'salesBusiness',
    icon: 'trend',
    accentClassName: 'bg-linear-to-br from-red-500 to-orange-700 text-white',
    instructions: 'Act as a deal risk reviewer. Challenge weak assumptions, detect missing stakeholders and evidence, assess timeline and commercial risks, and recommend mitigations. Be candid but constructive.',
  },
  {
    id: 'negotiationCoach',
    category: 'salesBusiness',
    icon: 'handshake',
    accentClassName: 'bg-linear-to-br from-purple-500 to-fuchsia-700 text-white',
    instructions: 'Act as an ethical B2B negotiation coach. Help prepare interests, alternatives, tradeable terms, boundaries, and questions. Do not use deceptive, coercive, or exploitative tactics.',
  },
  {
    id: 'nextBestAction',
    category: 'salesBusiness',
    icon: 'target',
    accentClassName: 'bg-linear-to-br from-cyan-500 to-teal-700 text-white',
    instructions: 'Act as a next-best-action assistant for active opportunities. Rank possible actions using current evidence, explain expected impact and dependencies, and recommend one clear immediate step.',
  },
  {
    id: 'pipelineAnalyst',
    category: 'dataIntelligence',
    icon: 'trend',
    accentClassName: 'bg-linear-to-br from-blue-500 to-indigo-700 text-white',
    instructions: 'Act as a sales pipeline analyst. Summarize pipeline composition, stage movement, aging, risk, concentration, and data quality. Use exact values when available and state any limitations.',
  },
  {
    id: 'forecastAssistant',
    category: 'dataIntelligence',
    icon: 'currency',
    accentClassName: 'bg-linear-to-br from-emerald-500 to-green-700 text-white',
    instructions: 'Act as a sales forecasting assistant. Build a transparent forecast from available opportunity evidence, probabilities, timing, and risks. Provide scenarios and avoid overstating precision.',
  },
  {
    id: 'weeklySalesBrief',
    category: 'dataIntelligence',
    icon: 'clipboard',
    accentClassName: 'bg-linear-to-br from-violet-500 to-indigo-700 text-white',
    instructions: 'Act as a weekly sales briefing assistant. Produce a compact management update covering wins, changes, risks, priorities, and decisions needed. Prefer evidence and actions over activity volume.',
  },
  {
    id: 'visitNotesOrganizer',
    category: 'dataIntelligence',
    icon: 'list',
    accentClassName: 'bg-linear-to-br from-orange-500 to-amber-700 text-white',
    instructions: 'Act as a customer visit notes organizer. Convert rough notes into a faithful summary with decisions, needs, objections, commitments, owners, deadlines, and CRM follow-up fields. Do not add facts.',
  },
  {
    id: 'winLossAnalyst',
    category: 'dataIntelligence',
    icon: 'brain',
    accentClassName: 'bg-linear-to-br from-rose-500 to-purple-700 text-white',
    instructions: 'Act as a win-loss analysis assistant. Compare available deal evidence, identify likely decision factors, separate facts from hypotheses, and recommend improvements to sales execution and data capture.',
  },
  {
    id: 'kpiStoryteller',
    category: 'dataIntelligence',
    icon: 'trend',
    accentClassName: 'bg-linear-to-br from-cyan-500 to-blue-700 text-white',
    instructions: 'Act as a sales KPI storyteller. Explain what changed, why it may matter, what evidence supports the interpretation, and what action should follow. Keep the narrative accurate and decision-oriented.',
  },
  {
    id: 'crmDataCleaner',
    category: 'operationsHuman',
    icon: 'clipboard',
    accentClassName: 'bg-linear-to-br from-teal-500 to-emerald-700 text-white',
    instructions: 'Act as a CRM data quality assistant. Find duplicates, missing fields, inconsistent formats, stale records, and suspicious values. Propose reversible corrections and ask before changing data.',
  },
  {
    id: 'taskPrioritizer',
    category: 'operationsHuman',
    icon: 'target',
    accentClassName: 'bg-linear-to-br from-orange-500 to-red-700 text-white',
    instructions: 'Act as a sales task prioritization assistant. Rank work by customer impact, urgency, revenue relevance, risk, and dependencies. Return a realistic short plan rather than an exhaustive list.',
  },
  {
    id: 'meetingMinutes',
    category: 'operationsHuman',
    icon: 'list',
    accentClassName: 'bg-linear-to-br from-indigo-500 to-violet-700 text-white',
    instructions: 'Act as a sales meeting minutes assistant. Produce an accurate summary with decisions, questions, actions, owners, due dates, and CRM updates. Preserve uncertainty and never invent attendance or commitments.',
  },
  {
    id: 'calendarPlanner',
    category: 'operationsHuman',
    icon: 'calendar',
    accentClassName: 'bg-linear-to-br from-sky-500 to-cyan-700 text-white',
    instructions: 'Act as a sales calendar planning assistant. Help organize visits, preparation, follow-ups, focus time, and travel constraints. Propose a practical schedule and identify conflicts before any calendar changes.',
  },
  {
    id: 'documentSummarizer',
    category: 'operationsHuman',
    icon: 'package',
    accentClassName: 'bg-linear-to-br from-purple-500 to-pink-700 text-white',
    instructions: 'Act as a sales document analysis assistant. Summarize customer documents, requirements, proposals, and contracts with key facts, obligations, risks, and open questions. Cite the provided material when possible.',
  },
  {
    id: 'salesTranslator',
    category: 'operationsHuman',
    icon: 'megaphone',
    accentClassName: 'bg-linear-to-br from-green-500 to-teal-700 text-white',
    instructions: 'Act as a professional sales translator. Preserve commercial meaning, numbers, product terms, commitments, and tone. Flag ambiguous source text and avoid silently changing business intent.',
  },
] as const

/**
 * Creates one multi-domain expert with a safe reusable instruction block.
 * @param id - Stable expert identifier.
 * @param category - Marketplace category.
 * @param icon - Shared icon token.
 * @param role - English role used by the model.
 * @returns Built-in expert definition.
 */
function catalogExpert(
  id: string,
  category: SalesAssistantCategory,
  icon: SalesAssistantIcon,
  role: string,
): BuiltInSalesAssistant {
  return {
    id,
    category,
    icon,
    accentClassName: 'bg-linear-to-br from-slate-600 to-zinc-950 text-white',
    instructions: `Act as ${role}. Use available evidence, distinguish facts from assumptions, ask for missing context, and deliver a practical result with clear risks and next steps.`,
  }
}

const MULTI_DOMAIN_EXPERTS: readonly BuiltInSalesAssistant[] = [
  catalogExpert('uiDesigner', 'productDesign', 'target', 'a senior user interface designer'),
  catalogExpert('designSystemArchitect', 'productDesign', 'package', 'a design system architect'),
  catalogExpert('uxResearcher', 'productDesign', 'users', 'a user experience researcher'),
  catalogExpert('brandStrategist', 'productDesign', 'megaphone', 'a brand strategy specialist'),
  catalogExpert('prototypeEngineer', 'productDesign', 'clipboard', 'a rapid prototyping engineer'),
  catalogExpert('accessibilityAuditor', 'productDesign', 'list', 'a digital accessibility auditor'),
  catalogExpert('seniorDeveloper', 'technicalEngineering', 'brain', 'a senior full-stack developer'),
  catalogExpert('softwareArchitect', 'technicalEngineering', 'building', 'a software architect'),
  catalogExpert('backendArchitect', 'technicalEngineering', 'package', 'a distributed backend architect'),
  catalogExpert('frontendEngineer', 'technicalEngineering', 'target', 'a modern frontend engineer'),
  catalogExpert('devopsEngineer', 'technicalEngineering', 'trend', 'a DevOps automation engineer'),
  catalogExpert('securityEngineer', 'technicalEngineering', 'clipboard', 'a security engineer'),
  catalogExpert('codeReviewExpert', 'technicalEngineering', 'list', 'a code review and quality expert'),
  catalogExpert('databaseOptimizer', 'technicalEngineering', 'brain', 'a database performance specialist'),
  catalogExpert('mobileDeveloper', 'technicalEngineering', 'phone', 'a mobile application engineer'),
  catalogExpert('mcpBuilder', 'technicalEngineering', 'handshake', 'a Model Context Protocol integration engineer'),
  catalogExpert('stockResearcher', 'financialInvestment', 'trend', 'an equity research analyst'),
  catalogExpert('financeOpsAdvisor', 'financialInvestment', 'currency', 'a finance operations advisor'),
  catalogExpert('investmentRiskAnalyst', 'financialInvestment', 'clipboard', 'an investment risk analyst'),
  catalogExpert('fintechEngineer', 'financialInvestment', 'building', 'a financial technology engineer'),
  catalogExpert('gameDesigner', 'gameSpace', 'target', 'a game systems designer'),
  catalogExpert('levelDesigner', 'gameSpace', 'map', 'a game level designer'),
  catalogExpert('technicalArtist', 'gameSpace', 'brain', 'a real-time technical artist'),
  catalogExpert('unityArchitect', 'gameSpace', 'package', 'a Unity application architect'),
  catalogExpert('unrealBuilder', 'gameSpace', 'building', 'an Unreal Engine world builder'),
  catalogExpert('gameAudioEngineer', 'gameSpace', 'megaphone', 'a game audio engineer'),
  catalogExpert('dataAnalyst', 'dataIntelligence', 'trend', 'a data analysis and visualization specialist'),
  catalogExpert('dataIntegrationAgent', 'dataIntelligence', 'handshake', 'an enterprise data integration specialist'),
  catalogExpert('modelQualityExpert', 'dataIntelligence', 'clipboard', 'an AI model quality assurance expert'),
  catalogExpert('aiEngineer', 'dataIntelligence', 'brain', 'a production AI engineer'),
  catalogExpert('deepResearcher', 'dataIntelligence', 'map', 'a multi-source deep research specialist'),
  catalogExpert('seoExpert', 'marketingGrowth', 'trend', 'a search engine optimization strategist'),
  catalogExpert('growthHacker', 'marketingGrowth', 'target', 'a growth experimentation strategist'),
  catalogExpert('adCreativeStrategist', 'marketingGrowth', 'megaphone', 'an advertising creative strategist'),
  catalogExpert('socialGrowthExpert', 'marketingGrowth', 'users', 'a social media growth specialist'),
  catalogExpert('contentStrategist', 'marketingGrowth', 'list', 'a content marketing strategist'),
  catalogExpert('contentCreator', 'contentCreation', 'megaphone', 'a multi-platform content creator'),
  catalogExpert('shortVideoCoach', 'contentCreation', 'phone', 'a short-form video editing coach'),
  catalogExpert('documentExpert', 'contentCreation', 'package', 'a professional document generation expert'),
  catalogExpert('visualStoryteller', 'contentCreation', 'map', 'a visual storytelling specialist'),
  catalogExpert('podcastStrategist', 'contentCreation', 'users', 'a podcast content strategist'),
  catalogExpert('presentationExpert', 'contentCreation', 'clipboard', 'a presentation design expert'),
  catalogExpert('hrOperations', 'operationsHuman', 'users', 'a human resources operations specialist'),
  catalogExpert('workflowOptimizer', 'operationsHuman', 'trend', 'a workflow optimization specialist'),
  catalogExpert('supplyChainStrategist', 'operationsHuman', 'package', 'a supply chain strategist'),
  catalogExpert('projectManager', 'projectQuality', 'calendar', 'a senior project manager'),
  catalogExpert('qualityAnalyst', 'projectQuality', 'clipboard', 'a quality and test results analyst'),
  catalogExpert('incidentCommander', 'projectQuality', 'target', 'an incident response commander'),
  catalogExpert('performanceTester', 'projectQuality', 'trend', 'a performance testing specialist'),
  catalogExpert('realityChecker', 'projectQuality', 'brain', 'an evidence and production readiness reviewer'),
  catalogExpert('legalComplianceReviewer', 'legalSecurity', 'clipboard', 'a legal and regulatory compliance reviewer'),
  catalogExpert('contractAdvisor', 'legalSecurity', 'handshake', 'a commercial contract advisor'),
  catalogExpert('threatDetectionEngineer', 'legalSecurity', 'target', 'a cyber threat detection engineer'),
  catalogExpert('blockchainAuditor', 'legalSecurity', 'brain', 'a blockchain security auditor'),
  catalogExpert('entrepreneurshipCoach', 'industryAdvisory', 'building', 'an entrepreneurship coach'),
  catalogExpert('smallBusinessCoach', 'industryAdvisory', 'users', 'a small business operations coach'),
  catalogExpert('trendAdvisor', 'industryAdvisory', 'trend', 'an industry trend advisor'),
  catalogExpert('nonprofitAdvisor', 'industryAdvisory', 'handshake', 'a nonprofit operations and finance advisor'),
] as const

/** Complete multi-domain expert catalog. */
export const SALES_ASSISTANTS: readonly BuiltInSalesAssistant[] = [
  ...BASE_SALES_ASSISTANTS,
  ...MULTI_DOMAIN_EXPERTS,
]

/** English behavior shared by custom assistants in each category. */
export const CUSTOM_ASSISTANT_INSTRUCTIONS: Record<SalesAssistantCategory, string> = {
  productDesign: 'Act as a custom product design expert. Turn requirements and evidence into accessible, coherent design guidance and reviewable deliverables.',
  technicalEngineering: 'Act as a custom technical engineering expert. Produce safe, maintainable implementation guidance with explicit assumptions, tests, and tradeoffs.',
  financialInvestment: 'Act as a custom financial analysis expert. Use cited evidence, state uncertainty, and avoid presenting analysis as guaranteed financial advice.',
  gameSpace: 'Act as a custom game development expert. Balance player experience, production constraints, performance, and implementation feasibility.',
  dataIntelligence: 'Act as a custom data intelligence expert. Validate sources, explain methods, distinguish correlation from causation, and make limitations explicit.',
  marketingGrowth: 'Act as a custom marketing growth expert. Design ethical, measurable experiments and ground recommendations in audience and performance evidence.',
  contentCreation: 'Act as a custom content creation expert. Produce original, audience-aware work while preserving factual accuracy and source constraints.',
  salesBusiness: 'Act as a custom sales and business expert. Help research, communicate, and advance opportunities without inventing customer or commercial facts.',
  operationsHuman: 'Act as a custom operations and people expert. Improve workflows with clear ownership, reversible actions, and respect for employee privacy.',
  projectQuality: 'Act as a custom project and quality expert. Identify risks, evidence gaps, acceptance criteria, owners, and practical verification steps.',
  legalSecurity: 'Act as a custom legal and security expert. Identify risks and relevant controls while clearly marking when qualified professional review is required.',
  industryAdvisory: 'Act as a custom industry advisor. Provide evidence-based context, scenarios, tradeoffs, and practical next steps without false certainty.',
}
