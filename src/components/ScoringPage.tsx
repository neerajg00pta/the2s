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

function netScoreWord(net: number): string {
  if (net <= -2) return 'EAGLE'
  if (net === -1) return 'BIRDIE'
  if (net === 0) return 'PAR'
  if (net === 1) return 'BOGEY'
  return 'DOUBLE+'
}

export function ScoringPage() {
  const { currentUser, isAdmin } = useAuth()
  const { config, users, teams, holes, scores, refresh } = useData()
  const { addToast } = useToast()
  const [currentHole, setCurrentHole] = useState(1)
  const [saving, setSaving] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [showHolePicker, setShowHolePicker] = useState(false)

  // Local score state: tracks pending edits before they're saved
  const [localScores, setLocalScores] = useState<Map<string, number>>(new Map())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activePlayer = useMemo(() => {
    if (selectedPlayerId) {
      return users.find(u => u.id === selectedPlayerId) ?? currentUser
    }
    return currentUser
  }, [selectedPlayerId, users, currentUser])

  const isViewingOther = activePlayer?.id !== currentUser?.id

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
          <div className={styles.scoreboardLabel}>{isViewingOther ? activePlayer?.name : 'Me'}</div>
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

      {/* Viewing banner + teammate toggle */}
      {isViewingOther && (
        <div className={styles.viewingBanner}>
          <div className={styles.viewingText}>
            Viewing: <strong>{activePlayer?.name}</strong> ({activePlayer?.pops} pops)
          </div>
          <button className={styles.viewingBack} onClick={() => setSelectedPlayerId(null)}>Back to me</button>
        </div>
      )}

      {/* Teammate toggle (always available) */}
      {teammate && !isViewingOther && (
        <div className={styles.teammateToggle}>
          <button className={styles.teammateBtn} onClick={() => setSelectedPlayerId(teammate.id)}>
            View {teammate.name}'s card
          </button>
        </div>
      )}
      {teammate && isViewingOther && activePlayer?.id === teammate.id && (
        <div className={styles.teammateToggle}>
          <button className={styles.teammateBtn} onClick={() => setSelectedPlayerId(null)}>
            Back to my card
          </button>
        </div>
      )}

      {/* Admin: full player selector */}
      {isAdmin && (
        <div className={styles.adminSelector}>
          <select
            value={selectedPlayerId ?? currentUser?.id ?? ''}
            onChange={e => {
              const val = e.target.value
              setSelectedPlayerId(val === currentUser?.id ? null : val || null)
            }}
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
      <div className={`${styles.scorecard} ${isViewingOther ? styles.scorecardOther : ''}`}>
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

        {/* Hole header with nav arrows */}
        <div className={styles.holeHeader}>
          <button className={`${styles.holeArrow} ${currentHole <= 1 ? styles.holeArrowHidden : ''}`} onClick={() => navigate(-1)}>◀</button>
          <div className={styles.holeMeta}>
            <span className={styles.holeNumber} onClick={() => setShowHolePicker(p => !p)}>Hole {currentHole}</span>
            <span className={styles.parBadge}>Par {hole.par}</span>
            {strokesOnHole > 0 && (
              <span className={styles.popsBadge}>{strokesOnHole === 1 ? '1 Pop' : '2 Pops'}</span>
            )}
            {isDoubleHole && <span className={styles.doubleBadge}>2x</span>}
          </div>
          <button className={`${styles.holeArrow} ${currentHole >= 18 ? styles.holeArrowHidden : ''}`} onClick={() => navigate(1)}>▶</button>
        </div>

        {/* Score input */}
        <div className={styles.scoreInput}>
          <button className={styles.scoreBtn} onClick={() => changeScore(-1)} disabled={displayScore <= 1 || saving}>
            &minus;
          </button>
          <div
            className={`${styles.scoreValue} ${saving ? styles.scoreSaving : ''} ${hasPendingEdit ? styles.scorePending : ''} ${!hasBeenSaved && !hasPendingEdit ? styles.scoreGhost : ''}`}
            onClick={!hasBeenSaved && !hasPendingEdit ? lockIn : undefined}
          >
            {displayScore}
          </div>
          <button className={styles.scoreBtn} onClick={() => changeScore(1)} disabled={displayScore >= 15 || saving}>
            +
          </button>
        </div>

        {/* Result line */}
        <div className={styles.resultLine}>
          {hasBeenSaved || hasPendingEdit ? (
            <>
              <span className={styles.resultNet}>Net</span>
              <span className={styles.resultName}>{netScoreWord(liveNetScore)}</span>
              <span className={styles.resultArrow}>⇒</span>
              <span className={`${styles.resultPts} ${livePoints > 0 ? styles.pointsPositive : ''}`}>{livePoints} {livePoints === 1 ? 'point' : 'points'}</span>
              {saving ? <span className={styles.saveIndicator}>saving...</span>
                : hasPendingEdit ? <span className={styles.saveIndicator}>unsaved</span>
                : <span className={styles.saveIndicator}>✓</span>}
            </>
          ) : (
            <span className={styles.ghostHint}>Tap score to lock in par</span>
          )}
        </div>
        {isAdmin && hasBeenSaved && (
          <div className={styles.clearRow}>
            <button className={styles.clearBtn} onClick={clearScore} disabled={saving}>Clear Score</button>
          </div>
        )}

        {/* Hole picker — toggled by clicking Hole # */}
        {showHolePicker && (
          <div className={styles.holeDots}>
            {sortedHoles.map(h => (
              <button
                key={h.number}
                className={`${styles.holeDot} ${h.number === currentHole ? styles.holeDotCurrent : ''} ${scoreSet.has(h.number) ? styles.holeDotFilled : ''}`}
                onClick={() => { flushAndNavigate(h.number); setShowHolePicker(false) }}
              >
                {h.number}
              </button>
            ))}
          </div>
        )}
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
