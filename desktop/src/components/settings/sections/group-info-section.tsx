import { useTranslation } from 'react-i18next'

interface GroupMemberView {
  id: string
  userId: string
  user?: { email?: string | null; display_name?: string | null } | null
}

interface GroupInfoSectionProps {
  groupName: string
  members: GroupMemberView[]
}

/**
 * Read-only group info for regular members.
 * @param props - Group name and members.
 * @returns Group info UI.
 */
export function GroupInfoSection({ groupName, members }: GroupInfoSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.groupInfo')}</p>
      <p className="text-base font-bold text-brand">{groupName}</p>
      <ul className="space-y-2">
        {members.map((member) => (
          <li
            key={member.id}
            className="rounded-2xl border border-zinc-950/10 px-3 py-2 text-sm text-brand dark:border-white/10"
          >
            {member.user?.display_name || member.user?.email || member.userId}
          </li>
        ))}
      </ul>
    </div>
  )
}
