import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { upsertScore, deleteScore } from '../lib/data-service'
import { getStrokesOnHole, getNetScore, getPoints, getPlayerTotals, buildTeamLeaderboard, buildIndividualLeaderboard } from '../lib/scoring'
import { Leaderboard } from './Leaderboard'
import { LatestTicker } from './LatestTicker'
import { ProgressGraph } from './ProgressGraph'
import styles from './ScoringPage.module.css'

function netScoreName(net: number): string {
  if (net <= -2) return 'Net Eagle'
  if (net === -1) return 'Net Birdie'
  if (net === 0) return 'Net Par'
  if (net === 1) return 'Net Bogey'
  return 'Net Double+'
}

export function ScoringPage() {
  const { currentUser, isAdmin } = useAuth()
  const { config, users, teams, holes, scores, refresh } = useData()
  const { addToast } = useToast()
  const [currentHole, setCurrentHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  // Local score state: tracks pending edits before they're saved
  const [localScores, setLocalScores] = useState<Map<string, number>>(new Map())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activePlayer = useMemo(() => {
    if (isAdmin && selectedPlayerId) {
      return users.find(u => u.id === selectedPlayerId) ?? currentUser
    }
    return currentUser
  }, [isAdmin, selectedPlayerId, users, currentUser])

  const sortedHoles = useMemo(() => [...holes].sort((a, b) => a.number - b.number), [holes])
  const hole = sortedHoles.find(h => h.number === currentHole)

  const teammate = useMemo(() => {
    if (!activePlayer?.teamId) return null
    return users.find(u => u.teamId === activePlayer.teamId && u.id !== activePlayer.id) ?? null
  }, [activePlayer, users])

  const playerTotals = useMemo(() => {
    if (!activePlayer) return null
    return getPlayerTotals(activePlayer, scores, holes, config.doubleHole)
  }, [activePlayer, scores, holes, config.doubleHole])

  // Team leaderboard (source of truth for team totals)
  const teamRows = useMemo(
    () => buildTeamLeaderboard(teams, users, scores, holes, config.doubleHole),
    [teams, users, scores, holes, config.doubleHole]
  )

  const myTeamRow = teamRows.find(r => r.playerTotals.some(p => p.userId === activePlayer?.id))
  const teamTotal = myTeamRow?.totalPoints ?? 0
  const leaderPoints = teamRows[0]?.totalPoints ?? 0

  // Current hole
  const localKey = activePlayer ? `${activePlayer.id}-${currentHole}` : ''
  const dbScore = useMemo(() => {
    if (!activePlayer) return null
    const s = scores.find(s => s.userId === activePlayer.id && s.holeNumber === currentHole)
    return s?.grossScore ?? null
  }, [activePlayer, scores, currentHole])

  const localPending = localScores.get(localKey)
  const displayScore = localPending ?? dbScore ?? hole?.par ?? 4
  const hasBeenSaved = dbScore !== null
  const hasPendingEdit = localPending !== undefined

  const scoreSet = useMemo(() => {
    if (!activePlayer) return new Set<number>()
    return new Set(scores.filter(s => s.userId === activePlayer.id).map(s => s.holeNumber))
  }, [activePlayer, scores])

  // Compute gap warnings: missing holes before the highest scored hole
  const gapWarnings = useMemo(() => {
    if (!activePlayer) return null
    const myScored = new Set(scores.filter(s => s.userId === activePlayer.id).map(s => s.holeNumber))
    const tmScored = teammate ? new Set(scores.filter(s => s.userId === teammate.id).map(s => s.holeNumber)) : null
    const maxHole = Math.max(0, ...myScored, ...(tmScored ?? []))
    if (maxHole === 0) return null

    const myGaps: number[] = []
    const tmGaps: number[] = []
    for (let h = 1; h < maxHole; h++) {
      if (!myScored.has(h)) myGaps.push(h)
      if (tmScored && !tmScored.has(h)) tmGaps.push(h)
    }
    if (!myGaps.length && !tmGaps.length) return null
    return { myGaps, tmGaps }
  }, [activePlayer, teammate, scores])

  const doSave = useCallback(async (gross: number, holeNum: number) => {
    if (!activePlayer) return
    setSaving(true)
    try {
      await upsertScore(activePlayer.id, holeNum, gross)
      await refresh()
      setLocalScores(prev => {
        const next = new Map(prev)
        next.delete(`${activePlayer.id}-${holeNum}`)
        return next
      })
    } catch {
      addToast('Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [activePlayer, refresh, addToast])

  const scheduleSave = useCallback((gross: number, holeNum: number) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => doSave(gross, holeNum), 1000)
  }, [doSave])

  useEffect(() => {
    const handleBlur = () => {
      if (saveTimeout.current && activePlayer) {
        clearTimeout(saveTimeout.current)
        saveTimeout.current = null
        const pending = localScores.get(`${activePlayer.id}-${currentHole}`)
        if (pending !== undefined) doSave(pending, currentHole)
      }
    }
    window.addEventListener('blur', handleBlur)
    const handleVis = () => { if (document.hidden) handleBlur() }
    document.addEventListener('visibilitychange', handleVis)
    return () => {
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [activePlayer, currentHole, localScores, doSave])

  const flushAndNavigate = useCallback((nextHole: number) => {
    if (saveTimeout.current && activePlayer) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
      const pending = localScores.get(`${activePlayer.id}-${currentHole}`)
      if (pending !== undefined) doSave(pending, currentHole)
    }
    setCurrentHole(nextHole)
  }, [activePlayer, currentHole, localScores, doSave])

  useEffect(() => {
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current) }
  }, [])

  const changeScore = (delta: number) => {
    if (!activePlayer || !hole) return
    const newScore = Math.min(15, Math.max(1, displayScore + delta))
    if (newScore === displayScore) return
    setLocalScores(prev => {
      const next = new Map(prev)
      next.set(localKey, newScore)
      return next
    })
    scheduleSave(newScore, currentHole)
  }

  // Tap the number to lock in the displayed score (useful for par)
  const lockIn = () => {
    if (!activePlayer || !hole || saving) return
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = null
    doSave(displayScore, currentHole)
  }

  // Admin: clear a score
  const clearScore = useCallback(async () => {
    if (!activePlayer || !hole) return
    setSaving(true)
    try {
      await deleteScore(activePlayer.id, hole.number)
      setLocalScores(prev => {
        const next = new Map(prev)
        next.delete(`${activePlayer.id}-${currentHole}`)
        return next
      })
      await refresh()
      addToast('Score cleared', 'info')
    } catch {
      addToast('Clear failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [activePlayer, hole, currentHole, refresh, addToast])

  const navigate = (dir: -1 | 1) => {
    const next = currentHole + dir
    if (next >= 1 && next <= 18) flushAndNavigate(next)
  }


  if (!currentUser) {
    return <LoginPage />
  }

  if (!hole) {
    return <div className={styles.loginPrompt}><p>Course not set up yet.</p></div>
  }

  const strokesOnHole = activePlayer ? getStrokesOnHole(activePlayer.pops, hole.handicap) : 0
  const isDoubleHole = hole.number === config.doubleHole
  const liveNetScore = getNetScore(displayScore, hole.par, strokesOnHole)
  const livePoints = getPoints(liveNetScore, isDoubleHole)

  // Individual leaderboard
  const playerRows = buildIndividualLeaderboard(teams, users, scores, holes, config.doubleHole)

  return (
    <div className={styles.page}>
      {/* Big 3 numbers */}
      <div className={styles.scoreboard}>
        <div className={styles.scoreboardItem}>
          <div className={styles.scoreboardValue}>{playerTotals?.totalPoints ?? 0}</div>
          <div className={styles.scoreboardLabel}>Me</div>
        </div>
        <div className={`${styles.scoreboardItem} ${styles.scoreboardTeam}`}>
          <div className={styles.scoreboardValue}>{teamTotal}</div>
          <div className={styles.scoreboardLabel}>Team</div>
        </div>
        <div className={styles.scoreboardItem}>
          <div className={styles.scoreboardValue}>{leaderPoints}</div>
          <div className={styles.scoreboardLabel}>Leader</div>
        </div>
      </div>

      {/* Admin player selector */}
      {isAdmin && (
        <div className={styles.adminSelector}>
          <select
            value={selectedPlayerId ?? currentUser?.id ?? ''}
            onChange={e => setSelectedPlayerId(e.target.value || null)}
            className={styles.playerSelect}
          >
            <option value={currentUser?.id ?? ''}>My scores</option>
            {users.filter(u => u.teamId && u.id !== currentUser?.id).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.pops})</option>
            ))}
          </select>
        </div>
      )}

      {/* Scorecard */}
      <div className={styles.scorecard}>
        {/* Three-column: hole info | result | wheel */}
        <div className={styles.cardBody}>
          <div className={styles.holeInfo}>
            <div className={styles.holeNumber}>Hole {currentHole}</div>
            <div className={styles.holePar}>Par {hole.par}</div>
            {strokesOnHole > 0 && (
              <span className={styles.popsBadge}>{strokesOnHole === 1 ? '1 Pop' : '2 Pops'}</span>
            )}
            {isDoubleHole && <span className={styles.doubleBadge}>2x</span>}
          </div>

          <div className={styles.resultCol}>
            {hasBeenSaved || hasPendingEdit ? (
              <>
                <span className={styles.resultName}>{netScoreName(liveNetScore)}</span>
                <span className={`${styles.resultPts} ${livePoints > 0 ? styles.pointsPositive : ''}`}>{livePoints} pts</span>
                {saving ? <span className={styles.saveIndicator}>saving...</span>
                  : hasPendingEdit ? <span className={styles.saveIndicator}>unsaved</span>
                  : <span className={styles.saveIndicator}>✓</span>}
              </>
            ) : (
              <span className={styles.ghostHint}>Drag to score</span>
            )}
          </div>

          <ScoreWheel
            value={displayScore}
            onChange={(v) => {
              if (v === displayScore) { lockIn(); return }
              const delta = v - displayScore
              changeScore(delta)
            }}
            ghost={!hasBeenSaved && !hasPendingEdit}
            pending={hasPendingEdit}
            saving={saving}
          />
        </div>

        {/* Gap warnings */}
        {gapWarnings && (
          <div className={styles.gapWarning}>
            {gapWarnings.myGaps.length > 0 && (
              <div>You: missing {gapWarnings.myGaps.join(', ')}</div>
            )}
            {gapWarnings.tmGaps.length > 0 && teammate && (
              <div>{teammate.name}: missing {gapWarnings.tmGaps.join(', ')}</div>
            )}
          </div>
        )}

        {isAdmin && hasBeenSaved && (
          <div className={styles.clearRow}>
            <button className={styles.clearBtn} onClick={clearScore} disabled={saving}>Clear</button>
          </div>
        )}

        {/* Nav + hole picker */}
        <div className={styles.navArrows}>
          <button className={styles.navBtn} onClick={() => navigate(-1)} disabled={currentHole <= 1}>
            ← {currentHole - 1}
          </button>
          <button className={styles.navBtn} onClick={() => navigate(1)} disabled={currentHole >= 18}>
            {currentHole + 1} →
          </button>
        </div>
        <div className={styles.holeDots}>
          {sortedHoles.map(h => (
            <button
              key={h.number}
              className={`${styles.holeDot} ${h.number === currentHole ? styles.holeDotCurrent : ''} ${scoreSet.has(h.number) ? styles.holeDotFilled : ''}`}
              onClick={() => flushAndNavigate(h.number)}
            >
              {h.number}
            </button>
          ))}
        </div>
      </div>

      {/* Latest ticker */}
      <LatestTicker />

      {/* Leaderboards below scorecard */}
      <Leaderboard teamRows={teamRows} playerRows={playerRows} />

      {/* Graph below leaderboards */}
      <ProgressGraph />
    </div>
  )
}

function LoginPage() {
  const { login } = useAuth()
  const { addToast } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    if (login(trimmed)) {
      addToast('Welcome!', 'success')
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
      setEmail('')
    }
  }

  return (
    <div className={styles.loginPage}>
      <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className={styles.loginIcon} />
      <form onSubmit={handleSubmit} className={styles.loginForm}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Enter your email"
          className={`${styles.loginInput} ${error ? styles.loginInputError : ''}`}
        />
        <button type="submit" className={styles.loginBtn}>Go</button>
      </form>
      {error && <p className={styles.loginError}>Email not found</p>}
    </div>
  )
}

/** Draggable score wheel */
function ScoreWheel({ value, onChange, ghost, pending, saving }: {
  value: number
  onChange: (v: number) => void
  ghost: boolean
  pending: boolean
  saving: boolean
}) {
  const ITEM_H = 44
  const MIN = 1
  const MAX = 12
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartY = useRef(0)
  const dragStartVal = useRef(value)
  const isDragging = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true
    dragStartY.current = e.touches[0].clientY
    dragStartVal.current = value
    e.stopPropagation()
  }, [value])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return
    e.preventDefault()
    e.stopPropagation()
    const dy = e.touches[0].clientY - dragStartY.current
    const delta = Math.round(dy / ITEM_H)
    const newVal = Math.min(MAX, Math.max(MIN, dragStartVal.current + delta))
    if (newVal !== value) onChange(newVal)
  }, [value, onChange])

  const onTouchEnd = useCallback(() => {
    isDragging.current = false
  }, [])

  // Also handle mouse drag for desktop
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartVal.current = value
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const dy = ev.clientY - dragStartY.current
      const delta = Math.round(dy / ITEM_H)
      const newVal = Math.min(MAX, Math.max(MIN, dragStartVal.current + delta))
      if (newVal !== value) onChange(newVal)
    }
    const onUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [value, onChange])

  const nums = [value + 2, value + 1, value, value - 1]
    .filter(n => n >= MIN && n <= MAX)

  return (
    <div
      ref={containerRef}
      className={styles.wheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      {nums.map(n => (
        <div
          key={n}
          className={`${styles.wheelItem} ${n === value ? styles.wheelCurrent : styles.wheelOther} ${n === value && ghost ? styles.scoreGhost : ''} ${n === value && pending ? styles.scorePending : ''} ${n === value && saving ? styles.scoreSaving : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </div>
      ))}
    </div>
  )
}
