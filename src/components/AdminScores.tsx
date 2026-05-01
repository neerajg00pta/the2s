import { useState, useCallback, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { upsertScore, deleteScore } from '../lib/data-service'
import { getStrokesOnHole, getNetScore, getPoints, getDoubleHole } from '../lib/scoring'
import styles from './AdminScores.module.css'

export function AdminScores() {
  const { isAdmin } = useAuth()
  const { users, holes, scores, refresh } = useData()
  const { addToast } = useToast()
  const [selectedUserId, setSelectedUserId] = useState('')
  const [saving, setSaving] = useState<number | null>(null)

  const sortedHoles = useMemo(() => [...holes].sort((a, b) => a.number - b.number), [holes])
  const doubleHole = getDoubleHole(holes)
  const player = users.find(u => u.id === selectedUserId)
  const playerScores = useMemo(() => {
    if (!selectedUserId) return new Map<number, number>()
    const map = new Map<number, number>()
    scores.filter(s => s.userId === selectedUserId).forEach(s => map.set(s.holeNumber, s.grossScore))
    return map
  }, [selectedUserId, scores])

  const handleScoreChange = useCallback(async (holeNumber: number, value: string) => {
    if (!selectedUserId) return
    const trimmed = value.trim()
    if (trimmed === '') {
      // Clear score
      setSaving(holeNumber)
      try {
        await deleteScore(selectedUserId, holeNumber)
        await refresh()
      } catch { addToast('Delete failed', 'error') }
      finally { setSaving(null) }
      return
    }
    const gross = parseInt(trimmed)
    if (isNaN(gross) || gross < 1 || gross > 15) return
    if (gross === playerScores.get(holeNumber)) return
    setSaving(holeNumber)
    try {
      await upsertScore(selectedUserId, holeNumber, gross)
      await refresh()
    } catch { addToast('Save failed', 'error') }
    finally { setSaving(null) }
  }, [selectedUserId, playerScores, refresh, addToast])

  const handleClearAll = useCallback(async () => {
    if (!confirm('Clear ALL scores for ALL players? This cannot be undone.')) return
    setSaving(-1)
    try {
      // Delete all scores by deleting where hole_number > 0 (all)
      const { supabase } = await import('../lib/supabase')
      await supabase.from('the2s_scores').delete().gt('hole_number', 0)
      await refresh()
      addToast('All scores cleared', 'success')
    } catch { addToast('Clear failed', 'error') }
    finally { setSaving(null) }
  }, [refresh, addToast])

  if (!isAdmin) return <div className={styles.denied}>Admin access required</div>

  // Totals
  let totalPoints = 0
  let totalNet = 0
  let holesPlayed = 0

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Scores</h2>
        <button className={styles.clearAllBtn} onClick={handleClearAll} disabled={saving !== null}>Clear All Scores</button>
      </div>

      <select
        value={selectedUserId}
        onChange={e => setSelectedUserId(e.target.value)}
        className={styles.playerSelect}
      >
        <option value="">Select player...</option>
        {[...users].sort((a, b) => a.name.localeCompare(b.name)).map(u => (
          <option key={u.id} value={u.id}>{u.fullName || u.name} ({u.pops} pops)</option>
        ))}
      </select>

      {player && (
        <>
        <div className={styles.playerHeader}>
          <span className={styles.playerName}>{player.fullName || player.name} — {player.pops} pops</span>
          <button className={styles.clearPlayerBtn} disabled={saving !== null} onClick={async () => {
            if (!confirm(`Clear all scores for ${player.name}?`)) return
            setSaving(-1)
            try {
              const { supabase } = await import('../lib/supabase')
              await supabase.from('the2s_scores').delete().eq('user_id', player.id)
              await refresh()
              addToast(`${player.name} scores cleared`, 'success')
            } catch { addToast('Clear failed', 'error') }
            finally { setSaving(null) }
          }}>Clear {player.name}</button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Hole</th>
                <th>Par</th>
                <th>HCP</th>
                <th>Pops</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoles.map(h => {
                const gross = playerScores.get(h.number)
                const strokes = getStrokesOnHole(player.pops, h.handicap)
                const isDouble = h.number === doubleHole
                const hasScore = gross !== undefined
                const net = hasScore ? getNetScore(gross, h.par, strokes) : null
                const pts = net !== null ? getPoints(net, isDouble) : 0

                if (hasScore) {
                  totalPoints += pts
                  totalNet += net!
                  holesPlayed++
                }

                return (
                  <tr key={h.number} className={`${saving === h.number ? styles.rowSaving : ''} ${isDouble ? styles.rowDouble : ''}`}>
                    <td className={styles.holeNum}>
                      {h.number}
                      {h.designation && <span className={styles[`desig_${h.designation}`]}> {h.designation === '2x' ? '2x' : h.designation === 'iii' ? 'III' : 'T'}</span>}
                    </td>
                    <td>{h.par}</td>
                    <td>{h.handicap}</td>
                    <td className={strokes > 0 ? styles.popsActive : styles.popsMuted}>{strokes}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={gross ?? ''}
                        placeholder="—"
                        className={styles.scoreInput}
                        onBlur={e => handleScoreChange(h.number, e.target.value)}
                        onChange={() => {/* controlled by onBlur */}}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </td>
                    <td className={net !== null ? (net < 0 ? styles.netGood : net > 0 ? styles.netBad : '') : styles.empty}>
                      {net !== null ? (net > 0 ? `+${net}` : net === 0 ? 'E' : net) : '—'}
                    </td>
                    <td className={pts > 0 ? styles.ptsGood : styles.empty}>
                      {hasScore ? pts : '—'}
                      {isDouble && hasScore && pts > 0 ? ' ★' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className={styles.totalRow}>
                <td colSpan={5}>Total ({holesPlayed} holes)</td>
                <td className={totalNet < 0 ? styles.netGood : totalNet > 0 ? styles.netBad : ''}>
                  {totalNet > 0 ? `+${totalNet}` : totalNet === 0 ? 'E' : totalNet}
                </td>
                <td className={styles.ptsGood}>{totalPoints}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
