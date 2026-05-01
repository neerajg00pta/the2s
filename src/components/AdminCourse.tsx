import { useState, useCallback } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { updateHole } from '../lib/data-service'
import styles from './AdminCourse.module.css'

export function AdminCourse() {
  const { isAdmin } = useAuth()
  const { config, holes, refresh } = useData()
  const { addToast } = useToast()
  const [saving, setSaving] = useState<number | null>(null)

  const sortedHoles = [...holes].sort((a, b) => a.number - b.number)

  const handleParChange = useCallback(async (holeNumber: number, par: number) => {
    setSaving(holeNumber)
    try {
      await updateHole(holeNumber, { par })
      await refresh()
    } catch {
      addToast('Save failed', 'error')
    } finally {
      setSaving(null)
    }
  }, [refresh, addToast])

  const handleHandicapChange = useCallback(async (holeNumber: number, handicap: number) => {
    if (handicap < 1 || handicap > 18) return
    const existing = holes.find(h => h.handicap === handicap && h.number !== holeNumber)
    if (existing) {
      addToast(`Handicap ${handicap} already used by hole ${existing.number}`, 'error')
      return
    }
    setSaving(holeNumber)
    try {
      await updateHole(holeNumber, { handicap })
      await refresh()
    } catch {
      addToast('Save failed', 'error')
    } finally {
      setSaving(null)
    }
  }, [holes, refresh, addToast])

  const handleDesignation = useCallback(async (holeNumber: number, value: string) => {
    const designation = value || null
    setSaving(holeNumber)
    try {
      await updateHole(holeNumber, { designation })
      await refresh()
    } catch {
      addToast('Save failed', 'error')
    } finally {
      setSaving(null)
    }
  }, [refresh, addToast])

  if (!isAdmin) return <div className={styles.denied}>Admin access required</div>

  const doubleHole = sortedHoles.find(h => h.designation === '2x')

  return (
    <div className={`${styles.container} ${config.poolLocked ? styles.containerLocked : ''}`}>
      <h2 className={styles.title}>Course Setup</h2>
      {config.poolLocked && <p className={styles.lockNote}>Course is locked. Unlock tournament to edit.</p>}
      <p className={styles.subtitle}>{config.courseName || 'Set course name in config'}</p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Hole</th>
              <th>Par</th>
              <th>HCP</th>
              <th>Special</th>
            </tr>
          </thead>
          <tbody>
            {sortedHoles.map(h => (
              <tr key={h.number} className={saving === h.number ? styles.rowSaving : ''}>
                <td className={styles.holeNum}>{h.number}</td>
                <td>
                  <select
                    value={h.par}
                    onChange={e => handleParChange(h.number, parseInt(e.target.value))}
                    className={styles.select}
                  >
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={18}
                    value={h.handicap}
                    onChange={e => handleHandicapChange(h.number, parseInt(e.target.value))}
                    className={styles.hcpInput}
                  />
                </td>
                <td>
                  <select
                    value={h.designation ?? ''}
                    onChange={e => handleDesignation(h.number, e.target.value)}
                    className={`${styles.select} ${h.designation === '2x' ? styles.desig2x : ''} ${h.designation === 'iii' ? styles.desigIii : ''} ${h.designation === 'tips' ? styles.desigTips : ''}`}
                  >
                    <option value="">—</option>
                    <option value="2x">2x</option>
                    <option value="iii">IIIs</option>
                    <option value="tips">Tips</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedHoles.length === 0 && (
        <p className={styles.empty}>No holes found. Run the SQL seed script to create 18 holes.</p>
      )}

      <div className={styles.summary}>
        <span>Total Par: {sortedHoles.reduce((s, h) => s + h.par, 0)}</span>
        {doubleHole && <span>2x: Hole {doubleHole.number}</span>}
      </div>
    </div>
  )
}
