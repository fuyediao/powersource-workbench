/**
 * Harness transcript: workflow tool cards, diffs, and messages.
 * Deliberately not Ask chat bubbles — rows read as a task log.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatMarkdown } from '@/components/chat/chat-markdown'
import {
  extractHarnessArtifacts,
  HarnessArtifact,
} from '@/components/harness/harness-artifact'
import { HarnessToolResult } from '@/components/harness/harness-tool-result'
import {
  BrainIcon,
  ChevronDownIcon,
  CloseIcon,
  CodeIcon,
  FileTextIcon,
  HarnessIcon,
  TerminalIcon,
  UserIcon,
} from '@/icons/AllIcons'
import type {
  HarnessCommandExecutionItem,
  HarnessComputerUseStepItem,
  HarnessDeliberationItem,
  HarnessFileChangeItem,
  HarnessItem,
  HarnessItemStatus,
  HarnessTurnStatus,
} from '@/types/harness'

/** Collapsible record of private proposals and cross-review findings. */
function DeliberationCard({ item }: { item: HarnessDeliberationItem }) {
  const { t } = useTranslation()
  const completed = item.status === 'completed'
  return (
    <ToolCard
      icon={<BrainIcon className="size-4" />}
      title={t('harness.transcript.deliberation.title')}
      subtitle={t('harness.transcript.deliberation.finalizer', { model: item.finalizerLabel })}
      status={item.status}
      statusLabel={completed
        ? t('harness.transcript.status.completed')
        : t('harness.transcript.deliberation.running')}
    >
      {completed ? (
        <details className="group border-t border-zinc-950/10 dark:border-white/10">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs font-bold text-muted transition hover:bg-zinc-950/3 hover:text-ink dark:hover:bg-white/5">
            <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            {t('harness.transcript.deliberation.showSources', { count: item.contributions.length })}
          </summary>
          <div className="space-y-2 border-t border-zinc-950/10 p-3 dark:border-white/10">
            {item.contributions.map((entry) => (
              <details key={`${entry.provider}:${entry.modelId}`} className="group/model rounded-xl bg-zinc-950/4 dark:bg-white/5">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-ink">
                  <ChevronDownIcon className="size-3 transition-transform group-open/model:rotate-180" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.effort ? <span className="text-[10px] text-muted">{entry.effort}</span> : null}
                </summary>
                <div className="space-y-3 border-t border-zinc-950/10 px-3 py-3 text-xs dark:border-white/10">
                  {entry.proposal ? (
                    <section>
                      <h4 className="mb-1 font-bold text-muted">{t('harness.transcript.deliberation.proposal')}</h4>
                      <ChatMarkdown
                        className="chat-markdown text-xs leading-5 text-ink"
                        content={entry.proposal}
                        toolbar={{
                          copy: t('chat.codeBlock.copy'),
                          download: t('chat.codeBlock.download'),
                          plain: t('chat.codeBlock.plain'),
                        }}
                      />
                    </section>
                  ) : null}
                  {entry.review ? (
                    <section>
                      <h4 className="mb-1 font-bold text-muted">{t('harness.transcript.deliberation.review')}</h4>
                      <ChatMarkdown
                        className="chat-markdown text-xs leading-5 text-ink"
                        content={entry.review}
                        toolbar={{
                          copy: t('chat.codeBlock.copy'),
                          download: t('chat.codeBlock.download'),
                          plain: t('chat.codeBlock.plain'),
                        }}
                      />
                    </section>
                  ) : null}
                  {entry.error ? <p className="text-red-600 dark:text-red-400">{entry.error}</p> : null}
                </div>
              </details>
            ))}
          </div>
        </details>
      ) : null}
    </ToolCard>
  )
}

interface HarnessTranscriptProps {
  items: HarnessItem[]
  turnStatus: HarnessTurnStatus
}

/**
 * Badge classes for one item status.
 * @param status - Item lifecycle value.
 * @returns Tailwind classes for the status pill.
 */
function statusPillClass(status: HarnessItemStatus): string {
  if (status === 'completed') {
    return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  }
  if (status === 'failed' || status === 'declined') {
    return 'bg-red-500/15 text-red-600 dark:text-red-400'
  }
  return 'bg-brand/15 text-brand'
}

/**
 * Shared shell for a tool card row.
 * @param props - Icon, title, status pill, and card body.
 * @returns Tool card element.
 */
function ToolCard({
  icon,
  title,
  subtitle,
  status,
  statusLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  status: HarnessItemStatus
  statusLabel: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-white/60 shadow-sm dark:border-white/10 dark:bg-zinc-950/40">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-semibold text-ink">{title}</p>
          {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusPillClass(status)}`}
        >
          {statusLabel}
        </span>
      </div>
      {children}
    </div>
  )
}

/**
 * Collapsible arguments and results for a tool call.
 * @param props - Tool protocol details.
 * @returns Details section, or null when no detail exists.
 */
function ToolDetails({
  argumentsText,
  result,
  error,
  durationMs,
}: {
  argumentsText: string
  result: string
  error?: string
  durationMs: number | null
}) {
  const { t } = useTranslation()
  if (!argumentsText && !result && !error && durationMs === null) return null

  return (
    <details className="group border-t border-zinc-950/10 dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-xs font-bold text-muted transition hover:bg-zinc-950/3 hover:text-ink dark:hover:bg-white/5">
        <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        <span>{t('harness.transcript.details')}</span>
        {durationMs !== null ? (
          <span className="ml-auto font-mono text-[11px] font-medium">{durationMs} ms</span>
        ) : null}
      </summary>
      <div className="space-y-3 border-t border-zinc-950/10 px-4 py-3 dark:border-white/10">
        {argumentsText ? (
          <section>
            <h4 className="mb-1.5 text-[10px] font-extrabold tracking-wide text-muted uppercase">
              {t('harness.transcript.arguments')}
            </h4>
            <pre className="max-h-52 overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] whitespace-pre-wrap text-ink dark:bg-white/5">
              {argumentsText}
            </pre>
          </section>
        ) : null}
        {result || error ? (
          <section>
            <h4 className="mb-1.5 text-[10px] font-extrabold tracking-wide text-muted uppercase">
              {error ? t('harness.transcript.error') : t('harness.transcript.result')}
            </h4>
            {error ? (
              <pre className="max-h-64 overflow-auto rounded-xl bg-red-500/10 p-3 font-mono text-[11px] whitespace-pre-wrap text-red-600 dark:text-red-400">{error}</pre>
            ) : (
              <HarnessToolResult result={result} />
            )}
          </section>
        ) : null}
      </div>
    </details>
  )
}

/**
 * Assistant prose plus any structured result artifacts.
 * @param props - Assistant response text.
 * @returns Message row and visual artifacts.
 */
function AgentMessageRow({ text }: { text: string }) {
  const { t } = useTranslation()
  const extraction = useMemo(() => extractHarnessArtifacts(text), [text])
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
        <HarnessIcon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        {extraction.markdown ? (
          <ChatMarkdown
            className="chat-markdown min-w-0 pt-1 text-sm leading-relaxed wrap-break-word text-ink"
            content={extraction.markdown}
            toolbar={{
              copy: t('chat.codeBlock.copy'),
              download: t('chat.codeBlock.download'),
              plain: t('chat.codeBlock.plain'),
            }}
          />
        ) : null}
        {extraction.artifacts.map((artifact, index) => (
          <HarnessArtifact key={`${artifact.title}-${index}`} artifact={artifact} />
        ))}
      </div>
    </div>
  )
}

/**
 * Displays one action in the Computer Use visual loop.
 * @param props - Computer Use progress item.
 * @returns Timeline row.
 */
function ComputerUseStep({ item }: { item: HarnessComputerUseStepItem }) {
  const { t } = useTranslation()
  const dotClass =
    item.status === 'completed'
      ? 'bg-emerald-500'
      : item.status === 'failed' || item.status === 'declined'
        ? 'bg-red-500'
        : 'animate-pulse bg-brand'
  return (
    <div className="ml-3 flex gap-3 border-l border-zinc-950/10 py-1 pl-5 dark:border-white/10">
      <span className={`mt-1.5 -ml-[25px] size-2.5 shrink-0 rounded-full ring-4 ring-canvas ${dotClass}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
            {t('harness.transcript.step', { number: item.step })}
          </span>
          <span className="rounded-md bg-zinc-950/5 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink dark:bg-white/10">
            {item.action}
          </span>
        </div>
        {item.reason ? <p className="mt-1 text-xs leading-5 text-muted">{item.reason}</p> : null}
        {item.screenshotDataUrl ? (
          <img src={item.screenshotDataUrl} alt="" loading="lazy" className="mt-2 max-h-52 rounded-xl border border-zinc-950/10 object-contain shadow-sm dark:border-white/10" />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Command execution card with captured output.
 * @param props - Command item.
 * @returns Command card.
 */
function CommandCard({ item }: { item: HarnessCommandExecutionItem }) {
  const { t } = useTranslation()
  const statusLabel =
    item.status === 'inProgress' && !item.aggregatedOutput
      ? t('harness.transcript.running')
      : t(`harness.transcript.status.${item.status}`)

  return (
    <ToolCard
      icon={<TerminalIcon className="size-4" />}
      title={item.command}
      subtitle={item.cwd}
      status={item.status}
      statusLabel={statusLabel}
    >
      {item.aggregatedOutput ? (
        <pre className="max-h-56 overflow-auto border-t border-zinc-950/10 px-4 py-3 font-mono text-xs whitespace-pre-wrap text-muted dark:border-white/10">
          {item.aggregatedOutput}
        </pre>
      ) : null}
    </ToolCard>
  )
}

/**
 * File change card with the touched paths and an optional diff.
 * @param props - File change item.
 * @returns Diff card.
 */
function FileChangeCard({ item }: { item: HarnessFileChangeItem }) {
  const { t } = useTranslation()
  const paths = item.changes.map((change) => change.path).join(', ')

  return (
    <ToolCard
      icon={<FileTextIcon className="size-4" />}
      title={paths || t('harness.transcript.fileChange')}
      subtitle={item.changes
        .map((change) => t(`harness.transcript.changeKind.${change.kind}`))
        .join(' · ')}
      status={item.status}
      statusLabel={t(`harness.transcript.status.${item.status}`)}
    >
      {item.diff ? (
        <pre className="max-h-64 overflow-auto border-t border-zinc-950/10 px-4 py-3 font-mono text-xs whitespace-pre dark:border-white/10">
          {item.diff.split('\n').map((line, index) => (
            <div
              key={`${index}-${line}`}
              className={
                line.startsWith('+')
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : line.startsWith('-')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted'
              }
            >
              {line || ' '}
            </div>
          ))}
        </pre>
      ) : null}
    </ToolCard>
  )
}

/**
 * Renders one transcript row.
 * @param props - Item to render.
 * @returns Row element.
 */
function TranscriptRow({ item }: { item: HarnessItem }) {
  const { t } = useTranslation()

  if (item.type === 'userMessage') {
    return (
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-brand-fg">
          <UserIcon className="size-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 pt-1 text-sm font-semibold whitespace-pre-wrap text-ink">
          {item.text}
        </p>
      </div>
    )
  }

  if (item.type === 'agentMessage') {
    return <AgentMessageRow text={item.text} />
  }

  if (item.type === 'reasoning') {
    return (
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-zinc-950/5 text-muted dark:bg-white/5">
          <BrainIcon className="size-4" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 pt-1 text-sm italic text-muted">{item.text}</p>
      </div>
    )
  }

  if (item.type === 'commandExecution') {
    return <CommandCard item={item} />
  }

  if (item.type === 'fileChange') {
    return <FileChangeCard item={item} />
  }

  if (item.type === 'mcpToolCall') {
    return (
      <ToolCard
        icon={<CodeIcon className="size-4" />}
        title={`${item.server} · ${item.tool}`}
        status={item.status}
        statusLabel={t(`harness.transcript.status.${item.status}`)}
      >
        <ToolDetails
          argumentsText={item.arguments ?? ''}
          result={item.result ?? ''}
          error={item.error ?? ''}
          durationMs={item.durationMs ?? null}
        />
      </ToolCard>
    )
  }

  if (item.type === 'crmToolCall') {
    return (
      <ToolCard
        icon={<HarnessIcon className="size-4" />}
        title={item.tool}
        subtitle={item.summary}
        status={item.status}
        statusLabel={t(`harness.transcript.status.${item.status}`)}
      >
        <ToolDetails
          argumentsText={item.arguments ?? ''}
          result={item.result ?? ''}
          durationMs={item.durationMs ?? null}
        />
      </ToolCard>
    )
  }

  if (item.type === 'computerUseStep') {
    return <ComputerUseStep item={item} />
  }

  if (item.type === 'deliberation') {
    return <DeliberationCard item={item} />
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3">
      <CloseIcon className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium text-red-600 dark:text-red-400">
        {item.message}
      </p>
    </div>
  )
}

/**
 * Scrolling transcript for the active Harness turn.
 * @param props - Items and turn status.
 * @returns Transcript region.
 */
export function HarnessTranscript({ items, turnStatus }: HarnessTranscriptProps) {
  const { t } = useTranslation()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [items.length, turnStatus])

  if (items.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
          <HarnessIcon className="size-7" aria-hidden />
        </span>
        <h2 className="text-lg font-extrabold tracking-tight text-brand">
          {t('harness.empty.title')}
        </h2>
        <p className="max-w-md text-sm font-medium text-muted">{t('harness.empty.body')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        {items.map((item) => (
          <TranscriptRow key={item.id} item={item} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
