import { useState } from 'react'
import { LoginBrandPanel } from '@/components/login/LoginBrandPanel'
import { LoginFormPanel } from '@/components/login/LoginFormPanel'

interface LoginPageProps {
  error: string | null
  configured: boolean
  isBusy: boolean
  onClearError: () => void
  onSignInWithGoogle: () => Promise<void>
  onSignInWithPassword: (email: string, password: string) => Promise<boolean>
  onSignInWithOtp: (email: string) => Promise<boolean>
  onVerifyEmailOtp: (email: string, token: string) => Promise<boolean>
}

/**
 * Desktop login shell aligned with geocrm-web Vue `LoginView`
 * (two-column brand + form with employee / email / OTP).
 * @param props - Auth actions and error state.
 * @returns Login screen.
 */
export function LoginPage({
  error,
  configured,
  isBusy,
  onClearError,
  onSignInWithGoogle,
  onSignInWithPassword,
  onSignInWithOtp,
  onVerifyEmailOtp,
}: LoginPageProps) {
  const [isTyping, setIsTyping] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="auth-gate grid h-full min-h-dvh lg:grid-cols-2 lg:overflow-hidden">
      <LoginBrandPanel
        isTyping={isTyping}
        password={password}
        showPassword={showPassword}
      />
      <LoginFormPanel
        error={error}
        configured={configured}
        isBusy={isBusy}
        onClearError={onClearError}
        onSignInWithGoogle={onSignInWithGoogle}
        onSignInWithPassword={onSignInWithPassword}
        onSignInWithOtp={onSignInWithOtp}
        onVerifyEmailOtp={onVerifyEmailOtp}
        onTypingChange={setIsTyping}
        onPasswordChange={setPassword}
        onShowPasswordChange={setShowPassword}
      />
    </div>
  )
}
