import { useCallback, useEffect, useState } from 'react'
import {
  loadSession,
  signIn as signInRequest,
  signOut as signOutRequest,
} from '@/services/auth-api'
import type { WorkbenchUser } from '@/types/auth'
import { persistAuthSession, readAuthSession } from '@/utils/api'
import { apiErrorMessage } from '@/utils/api-error'

interface AuthState {
  error: string
  loading: boolean
  user: WorkbenchUser | null
}

/**
 * Manages the Workbench password authentication lifecycle.
 * @returns Authentication state and account actions.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ error: '', loading: true, user: null })

  useEffect(() => {
    if (!readAuthSession()) {
      setState({ error: '', loading: false, user: null })
      return
    }
    void loadSession()
      .then((user) => setState({ error: '', loading: false, user }))
      .catch(() => {
        persistAuthSession(null)
        setState({ error: '', loading: false, user: null })
      })
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setState((current) => ({ ...current, error: '', loading: true }))
    try {
      const user = await signInRequest(username, password)
      setState({ error: '', loading: false, user })
      return true
    } catch (error) {
      setState({ error: apiErrorMessage(error), loading: false, user: null })
      return false
    }
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    try {
      await signOutRequest()
    } finally {
      persistAuthSession(null)
      setState({ error: '', loading: false, user: null })
    }
  }, [])

  return { ...state, login, logout }
}
