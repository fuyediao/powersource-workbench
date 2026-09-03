import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  createProfile,
  deleteProfileAvatar,
  fetchProfile,
  uploadProfileAvatar,
  upsertProfileFields,
} from '@/services/profile-api'
import type { UserRole } from '@/types/crm-settings'
import type { GroupRecord } from '@/services/groups-api'
import { resolvePhoneCountryIso } from '@/utils/settings/phone-number-parts'

/**
 * Editable CRM profile for Settings (manual save for text fields).
 * @param user - Supabase auth user.
 * @param roles - Role/group labels for organization field.
 * @param tOrg - Translator for organization role labels.
 * @returns Form state and actions.
 */
export function useProfile(
  user: User | null | undefined,
  roles: {
    isSystemAdmin: boolean
    isSuperAdmin: boolean
    isGroupAdmin: boolean
    isRegularUser: boolean
    currentGroup: GroupRecord | null
    userRole: UserRole | null
  },
  tOrg: (key: string) => string,
) {
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneCountry, setPhoneCountry] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [oauthAvatarUrl, setOauthAvatarUrl] = useState('')
  const [primaryAuthEmail, setPrimaryAuthEmail] = useState('')
  const [googleIdentityEmail, setGoogleIdentityEmail] = useState('')
  const [googleIdentityName, setGoogleIdentityName] = useState('')
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const organizationLabel = useMemo(() => {
    if (!user) {
      return ''
    }
    if (roles.isSuperAdmin) {
      return tOrg('settings.profile.organization.superAdmin')
    }
    if (roles.isSystemAdmin) {
      return tOrg('settings.profile.organization.systemAdmin')
    }
    if (roles.currentGroup) {
      const name = roles.currentGroup.name
      if (roles.isGroupAdmin) {
        return `${name} ${tOrg('settings.profile.organization.groupAdmin')}`
      }
      if (roles.isRegularUser) {
        return `${name} ${tOrg('settings.profile.organization.user')}`
      }
    }
    return ''
  }, [user, roles, tOrg])

  const load = useCallback(async () => {
    if (!user) {
      return
    }
    setIsLoading(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      const meta = user.user_metadata as Record<string, unknown> | undefined
      const oauthImg = (meta?.picture ?? meta?.avatar_url) as string | undefined
      if (oauthImg?.trim()) {
        setOauthAvatarUrl(oauthImg.trim())
      }
      setPrimaryAuthEmail(user.email ?? '')
      const googleIdentity = user.identities?.find((identity) => identity.provider === 'google') as
        | { identity_data?: Record<string, unknown> | null }
        | undefined
      setIsGoogleUser(Boolean(googleIdentity))
      const gData = googleIdentity?.identity_data
      const gEmail = typeof gData?.email === 'string' ? gData.email.trim() : ''
      const gName =
        typeof gData?.full_name === 'string'
          ? gData.full_name.trim()
          : typeof gData?.name === 'string'
            ? gData.name.trim()
            : ''
      setGoogleIdentityEmail(gEmail)
      setGoogleIdentityName(gName)
      if (typeof gData?.picture === 'string' && gData.picture.trim()) {
        setOauthAvatarUrl(gData.picture.trim())
      }

      let row = await fetchProfile(user.id)
      if (!row) {
        row = await createProfile({
          id: user.id,
          email: user.email,
          displayName: (meta?.full_name as string | undefined) ?? user.email ?? '',
          avatarUrl: oauthImg ?? null,
        })
      }
      if (row) {
        setDisplayName(row.display_name ?? '')
        setEmail(row.email ?? user.email ?? '')
        setBio(row.bio ?? '')
        setPhoneNumber(row.phone_number ?? '')
        setPhoneCountry(resolvePhoneCountryIso(row.phone_country, row.phone_number ?? ''))
        setAvatarUrl(row.avatar_url ?? '')
        setEmployeeId(row.employee_id ?? '')
      } else {
        setDisplayName((meta?.full_name as string | undefined) ?? '')
        setEmail(user.email ?? '')
      }
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Reloads profile from the server and clears save feedback.
   * @returns Nothing.
   */
  async function reloadProfile(): Promise<void> {
    await load()
  }

  /**
   * Shows a brief success flash then clears it.
   * @returns Nothing.
   */
  function flashSaveSuccess(): void {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2000)
  }

  /**
   * Persists display name, bio, phone, and current email choice.
   * @returns True on success.
   */
  async function saveProfile(): Promise<boolean> {
    if (!user) {
      return false
    }
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const ok = await upsertProfileFields(user.id, {
        display_name: displayName,
        bio,
        phone_number: phoneNumber,
        phone_country: phoneCountry || null,
        email: email || null,
      })
      if (!ok) {
        setSaveError('error')
        return false
      }
      flashSaveSuccess()
      return true
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Uploads a new avatar image.
   * @param file - Image file.
   * @returns Nothing.
   */
  async function uploadAvatar(file: File): Promise<void> {
    if (!user) {
      return
    }
    setIsAvatarUploading(true)
    setSaveError(null)
    const result = await uploadProfileAvatar(user.id, file)
    if ('error' in result) {
      setSaveError(result.error)
      setIsAvatarUploading(false)
      return
    }
    await upsertProfileFields(user.id, { avatar_url: result.publicUrl, avatar_index: null })
    setAvatarUrl(result.publicUrl)
    setIsAvatarUploading(false)
    flashSaveSuccess()
  }

  /**
   * Restores the Google OAuth avatar and clears custom storage object.
   * @returns Nothing.
   */
  async function restoreGoogleAvatar(): Promise<void> {
    if (!user || !oauthAvatarUrl) {
      return
    }
    await deleteProfileAvatar(user.id)
    await upsertProfileFields(user.id, { avatar_url: oauthAvatarUrl, avatar_index: null })
    setAvatarUrl(oauthAvatarUrl)
    flashSaveSuccess()
  }

  const canChooseDisplayEmail = Boolean(
    primaryAuthEmail &&
      googleIdentityEmail &&
      primaryAuthEmail.trim().toLowerCase() !== googleIdentityEmail.trim().toLowerCase(),
  )

  const hasCustomUpload = Boolean(avatarUrl && avatarUrl !== oauthAvatarUrl)
  const displayAvatarUrl = avatarUrl || oauthAvatarUrl || null

  return {
    displayName,
    setDisplayName,
    bio,
    setBio,
    phoneNumber,
    setPhoneNumber,
    phoneCountry,
    setPhoneCountry,
    email,
    setEmail,
    avatarUrl: displayAvatarUrl,
    employeeId,
    oauthAvatarUrl,
    primaryAuthEmail,
    googleIdentityEmail,
    googleIdentityName,
    isGoogleUser,
    isLoading,
    isSaving,
    isAvatarUploading,
    saveSuccess,
    saveError,
    organizationLabel,
    canChooseDisplayEmail,
    hasCustomUpload,
    saveProfile,
    reloadProfile,
    uploadAvatar,
    restoreGoogleAvatar,
    applyGoogleName: () => {
      if (googleIdentityName) {
        setDisplayName(googleIdentityName)
      }
    },
  }
}
