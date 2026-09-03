/**
 * Per-action approval bar: Allow once / Allow for this session / Deny.
 * Sits above the composer while a turn is paused on an approval request.
 */

import { useTranslation } from 'react-i18next'
import { CpuIcon, FileTextIcon, MailIcon, TerminalIcon } from '@/icons/AllIcons'
import type { HarnessApprovalDecision, HarnessApprovalRequest } from '@/types/harness'

interface HarnessApprovalBarProps {
  request: HarnessApprovalRequest
  onDecide: (decision: HarnessApprovalDecision) => void
}

/**
 * Approval prompt for one pending command or patch.
 * @param props - Pending request and decision handler.
 * @returns Approval bar element.
 */
export function HarnessApprovalBar({ request, onDecide }: HarnessApprovalBarProps) {
  const { t } = useTranslation()
  const isCommand = request.kind === 'commandExecution'
  const isComputerUse = request.kind === 'computerUse'
  const isMail = request.kind === 'sendMail'
  const target = isMail
    ? request.mail?.to.join(', ') ?? ''
    : isComputerUse
    ? (request.computerAction ?? '')
    : isCommand
    ? (request.command ?? '')
    : (request.changes ?? []).map((change) => change.path).join(', ')

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
          {isMail ? (
            <MailIcon className="size-4" aria-hidden />
          ) : isComputerUse ? (
            <CpuIcon className="size-4" aria-hidden />
          ) : isCommand ? (
            <TerminalIcon className="size-4" aria-hidden />
          ) : (
            <FileTextIcon className="size-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-brand">
            {isMail
              ? t('harness.approval.sendMailTitle')
              : isComputerUse
              ? t('harness.approval.computerUseTitle')
              : isCommand
              ? t('harness.approval.commandTitle')
              : t('harness.approval.fileChangeTitle')}
          </p>
          <p className="truncate font-mono text-xs text-muted">{target}</p>
          {isMail && request.mail ? (
            <div className="mt-1 space-y-0.5 text-xs font-medium text-muted">
              {request.mail.cc.length > 0 ? (
                <p>{t('harness.approval.cc', { names: request.mail.cc.join(', ') })}</p>
              ) : null}
              <p className="font-semibold text-ink">{request.mail.subject}</p>
              {request.mail.snippet ? <p className="line-clamp-2">{request.mail.snippet}</p> : null}
              {request.mail.attachments.length > 0 ? (
                <p>{t('harness.approval.attachments', { names: request.mail.attachments.join(', ') })}</p>
              ) : null}
            </div>
          ) : null}
          {request.reason ? (
            <p className="mt-1 text-xs font-medium text-muted">{request.reason}</p>
          ) : null}
          {request.screenshotDataUrl ? (
            <img src={request.screenshotDataUrl} alt="" className="mt-2 max-h-44 rounded-xl border border-zinc-950/10 object-contain dark:border-white/10" />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-brand px-3.5 py-2 text-sm font-bold text-brand-fg shadow-lg shadow-brand/25 transition hover:opacity-90"
          onClick={() => onDecide('accept')}
        >
          {t('harness.approval.allowOnce')}
        </button>
        {!isMail ? (
          <button
            type="button"
            className="rounded-xl bg-brand/10 px-3.5 py-2 text-sm font-bold text-brand transition hover:bg-brand/15"
            onClick={() => onDecide('acceptForSession')}
          >
            {t('harness.approval.allowSession')}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-xl bg-zinc-950/5 px-3.5 py-2 text-sm font-bold text-ink transition hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
          onClick={() => onDecide('decline')}
        >
          {t('harness.approval.deny')}
        </button>
      </div>
    </div>
  )
}
