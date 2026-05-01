import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User } from '../lib/types'
import { SESSION_COOKIE, ADMIN_COOKIE } from '../lib/config'
import { useData } from './DataContext'

const SESSION_EXPIRY_DAYS = 30
const SPECTATOR_COOKIE = 'the2s_spectator'

interface AuthState {
  currentUser: User | null
  isSpectator: boolean
  login: (email: string) => boolean
  loginDirect: (user: User) => void
  logout: () => void
  isAdmin: boolean
  activateAdmin: () => boolean
  deactivateAdmin: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { users, config } = useData()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isSpectator, setIsSpectator] = useState(() => getCookie(SPECTATOR_COOKIE) === '1')
  const [adminActivated, setAdminActivated] = useState(() => getCookie(ADMIN_COOKIE) === '1')

  const spectatorToken = config.spectatorToken || 'the2s'

  const findByEmail = useCallback(
    (email: string) => users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null,
    [users]
  )

  const isSpectatorToken = useCallback(
    (input: string) => input.toLowerCase() === spectatorToken.toLowerCase(),
    [spectatorToken]
  )

  // Restore session from cookie
  useEffect(() => {
    if (isSpectator || currentUser) return
    const savedEmail = getCookie(SESSION_COOKIE)
    if (savedEmail) {
      const user = findByEmail(savedEmail)
      if (user) setCurrentUser(user)
    }
  }, [users, currentUser, isSpectator, findByEmail])

  // Keep currentUser in sync with users array
  useEffect(() => {
    if (currentUser) {
      const fresh = users.find(u => u.id === currentUser.id)
      if (fresh && (fresh.pops !== currentUser.pops || fresh.teamId !== currentUser.teamId || fresh.name !== currentUser.name)) {
        setCurrentUser(fresh)
      }
    }
  }, [users, currentUser])

  // Auto-login via URL param (?token=email or ?token=spectator_token)
  useEffect(() => {
    const processToken = () => {
      const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '')
      const token = params.get('token')
      if (!token) return

      const cleanUrl = () => {
        // Handle both regular and hash-based URLs
        const hash = window.location.hash
        if (hash.includes('?')) {
          const cleanHash = hash.split('?')[0]
          window.history.replaceState({}, '', window.location.pathname + cleanHash)
        } else {
          const url = new URL(window.location.href)
          url.searchParams.delete('token')
          window.history.replaceState({}, '', url.toString())
        }
      }

      if (isSpectatorToken(token)) {
        setCurrentUser(null)
        setAdminActivated(false)
        deleteCookie(SESSION_COOKIE)
        deleteCookie(ADMIN_COOKIE)
        setIsSpectator(true)
        setCookie(SPECTATOR_COOKIE, '1', SESSION_EXPIRY_DAYS)
        cleanUrl()
      } else if (!currentUser) {
        const user = findByEmail(token)
        if (user) {
          setCurrentUser(user)
          setCookie(SESSION_COOKIE, token, SESSION_EXPIRY_DAYS)
          cleanUrl()
        }
      }
    }

    processToken()
    window.addEventListener('hashchange', processToken)
    return () => window.removeEventListener('hashchange', processToken)
  }, [users, currentUser, findByEmail, isSpectatorToken])

  const login = useCallback(
    (input: string) => {
      const user = findByEmail(input)
      if (user) {
        setCurrentUser(user)
        setCookie(SESSION_COOKIE, input, SESSION_EXPIRY_DAYS)
        setAdminActivated(false)
        deleteCookie(ADMIN_COOKIE)
        return true
      }
      return false
    },
    [findByEmail]
  )

  const loginDirect = useCallback((user: User) => {
    setCurrentUser(user)
    setCookie(SESSION_COOKIE, user.email, SESSION_EXPIRY_DAYS)
  }, [])

  const logout = useCallback(() => {
    setCurrentUser(null)
    setIsSpectator(false)
    setAdminActivated(false)
    deleteCookie(SESSION_COOKIE)
    deleteCookie(ADMIN_COOKIE)
    deleteCookie(SPECTATOR_COOKIE)
  }, [])

  const activateAdmin = useCallback(() => {
    if (currentUser?.admin) {
      setAdminActivated(true)
      setCookie(ADMIN_COOKIE, '1', SESSION_EXPIRY_DAYS)
      return true
    }
    return false
  }, [currentUser])

  const deactivateAdmin = useCallback(() => {
    setAdminActivated(false)
    deleteCookie(ADMIN_COOKIE)
  }, [])

  const isAdmin = !!(currentUser?.admin && adminActivated)

  return (
    <AuthContext.Provider value={{ currentUser, isSpectator, login, loginDirect, logout, isAdmin, activateAdmin, deactivateAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
