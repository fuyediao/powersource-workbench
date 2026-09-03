import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Languages, Monitor, Moon, Settings, ShieldCheck, Sun, UserRound } from '@/icons/all-icons'
import { createInvitation } from '@/services/auth-api'
import type { InvitationResult, WorkbenchUser } from '@/types/auth'
import { apiErrorMessage } from '@/utils/api-error'
import { isPlatformAdmin } from '@/utils/roles'
import { applyTheme, loadTheme, type ThemePreference } from '@/utils/theme'

type SettingsSection = 'general' | 'appearance' | 'account' | 'invitations'

interface SettingsPageProps {
  user: WorkbenchUser
}

/**
 * Renders Workbench settings without a legacy permission model.
 * @param props - Current account.
 * @returns The settings page.
 */
export function SettingsPage({ user }: SettingsPageProps) {
  const { t, i18n } = useTranslation()
  const [section, setSection] = useState<SettingsSection>('general')
  const [theme, setTheme] = useState<ThemePreference>(loadTheme)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [invitation, setInvitation] = useState<InvitationResult | null>(null)
  const [invitationError, setInvitationError] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => applyTheme(theme), [theme])

  /**
   * Resolves the localized label for the signed-in Workbench role.
   * @returns Translation key for the role badge.
   */
  function roleLabelKey(): 'settings.superAdmin' | 'settings.systemAdmin' | 'settings.member' {
    if (user.role === 'super_admin') return 'settings.superAdmin'
    if (user.role === 'system_admin') return 'settings.systemAdmin'
    return 'settings.member'
  }

  const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
    { id: 'general', label: t('settings.general'), icon: Settings },
    { id: 'appearance', label: t('settings.appearance'), icon: Sun },
    { id: 'account', label: t('settings.account'), icon: UserRound },
  ]
  if (isPlatformAdmin(user.role)) {
    sections.push({ id: 'invitations', label: t('settings.invitations'), icon: ShieldCheck })
  }

  /**
   * Creates a one-time invitation for a reserved username.
   * @returns Nothing.
   */
  async function handleCreateInvitation(): Promise<void> {
    setCreating(true)
    setInvitationError('')
    try {
      setInvitation(await createInvitation(username.trim(), displayName.trim()))
      setUsername('')
      setDisplayName('')
    } catch (error) {
      setInvitationError(apiErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  /**
   * Copies the one-time invitation code to the clipboard.
   * @returns Nothing.
   */
  async function copyInvitationCode(): Promise<void> {
    if (!invitation) return
    await navigator.clipboard.writeText(invitation.invitationCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="page settings-page">
      <div className="page-title"><Settings size={24} /><h2>{t('settings.title')}</h2></div>
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map((item) => {
            const Icon = item.icon
            return <button className={section === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setSection(item.id)}><Icon size={18} />{item.label}</button>
          })}
        </nav>
        <div className="settings-content">
          {section === 'general' ? (
            <div className="settings-card">
              <h3>{t('settings.language')}</h3>
              <div className="setting-row"><Languages size={20} /><span>{t('settings.language')}</span><select value={i18n.language === 'zh-TW' ? 'zh-TW' : 'en'} onChange={(event) => void i18n.changeLanguage(event.target.value)}><option value="zh-TW">{t('settings.traditionalChinese')}</option><option value="en">English</option></select></div>
              <p className="settings-note">{t('settings.noPermissionEditor')}</p>
            </div>
          ) : null}
          {section === 'appearance' ? (
            <div className="settings-card">
              <h3>{t('settings.theme')}</h3>
              <div className="theme-options">
                {([{ id: 'system', icon: Monitor }, { id: 'light', icon: Sun }, { id: 'dark', icon: Moon }] as const).map((option) => {
                  const Icon = option.icon
                  return <button className={theme === option.id ? 'active' : ''} key={option.id} type="button" onClick={() => setTheme(option.id)}><Icon size={22} /><span>{t(`settings.${option.id}`)}</span>{theme === option.id ? <Check size={17} /> : null}</button>
                })}
              </div>
            </div>
          ) : null}
          {section === 'account' ? (
            <div className="settings-card">
              <h3>{t('settings.profile')}</h3>
              <div className="profile-card"><div className="avatar">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div><div><strong>{user.displayName || user.username}</strong><span>@{user.username}</span></div><div className="role-badge">{t(roleLabelKey())}</div></div>
            </div>
          ) : null}
          {section === 'invitations' && isPlatformAdmin(user.role) ? (
            <div className="settings-card">
              <h3>{t('settings.invitations')}</h3>
              <p className="muted">{t('settings.invitationHelp')}</p>
              <label><span>{t('settings.reservedUsername')}</span><input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
              <label><span>{t('settings.displayName')}</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <button className="primary-button compact" disabled={creating || !username.trim()} type="button" onClick={() => void handleCreateInvitation()}>{t(creating ? 'settings.creatingInvitation' : 'settings.createInvitation')}</button>
              {invitationError ? <p className="form-error">{invitationError}</p> : null}
              {invitation ? <div className="invitation-result"><p>{t('settings.invitationCreated')}</p><code>{invitation.invitationCode}</code><button type="button" onClick={() => void copyInvitationCode()}>{copied ? <Check size={17} /> : <Copy size={17} />}{t(copied ? 'settings.codeCopied' : 'settings.copyCode')}</button></div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
