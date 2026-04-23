import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useToast } from '../contexts/ToastContext'
import styles from './Layout.module.css'

export function Layout({ children }: { children: ReactNode }) {
  const { currentUser, login, logout, isAdmin, activateAdmin, deactivateAdmin } = useAuth()
  const { loading, config } = useData()
  const { addToast } = useToast()
  const [emailInput, setEmailInput] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [loginError, setLoginError] = useState(false)
  const location = useLocation()

  // Hidden admin activation: type "admin" anywhere, or long-press name
  const keyBuffer = useRef('')
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      keyBuffer.current += e.key.toLowerCase()
      keyBuffer.current = keyBuffer.current.slice(-5)
      if (keyBuffer.current === 'admin') {
        keyBuffer.current = ''
        if (activateAdmin()) addToast('Admin mode activated', 'success')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activateAdmin, addToast])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = emailInput.trim().toLowerCase()
    if (!login(trimmed)) {
      setLoginError(true)
      setTimeout(() => setLoginError(false), 2000)
    } else {
      setLoginOpen(false)
    }
    setEmailInput('')
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <span>Loading tournament data...</span>
      </div>
    )
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className={styles.brandIcon} />
          <span className={styles.brandText}>{config.tournamentName || 'The 2s'}</span>
        </Link>

        <div className={styles.headerRight}>
          <Link to="/rules" className={`${styles.navLink} ${isActive('/rules') ? styles.navLinkActive : ''}`}>Rules</Link>
          {currentUser ? (
            <>
              <span
                className={styles.userName}
                onTouchStart={() => { longPressRef.current = setTimeout(() => { if (activateAdmin()) addToast('Admin mode activated', 'success') }, 800) }}
                onTouchEnd={() => { if (longPressRef.current) clearTimeout(longPressRef.current) }}
                onTouchCancel={() => { if (longPressRef.current) clearTimeout(longPressRef.current) }}
              >{currentUser.fullName || currentUser.name}</span>
              <button onClick={logout} className={styles.logoutBtn}>Log out</button>
            </>
          ) : loginOpen ? (
            <form onSubmit={handleLogin} className={styles.loginForm}>
              <input
                type="email"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                placeholder="Your email"
                className={`${styles.codeInput} ${loginError ? styles.codeInputError : ''}`}
              />
              <button type="submit" className={styles.goBtn}>Go</button>
              <button type="button" onClick={() => setLoginOpen(false)} className={styles.cancelBtn}>&times;</button>
            </form>
          ) : (
            <button onClick={() => setLoginOpen(true)} className={styles.signInBtn}>Sign in</button>
          )}
        </div>
      </header>

      {isAdmin && (
        <nav className={styles.adminBar}>
          <Link to="/admin" className={`${styles.adminLink} ${isActive('/admin') ? styles.adminLinkActive : ''}`}>Admin</Link>
          <Link to="/admin/course" className={`${styles.adminLink} ${isActive('/admin/course') ? styles.adminLinkActive : ''}`}>Course</Link>
          <button className={styles.exitAdminBtn} onClick={() => { deactivateAdmin(); addToast('Player mode', 'success') }}>
            Exit Admin
          </button>
        </nav>
      )}

      <main className={styles.main}>
        {children}
      </main>
    </>
  )
}
