import { useState, useCallback } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { updateHole, updateConfig } from '../lib/data-service'
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
    // Check for duplicates
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

  const handleDoubleHole = useCallback(async (holeNumber: number) => {
    try {
      await updateConfig({ doubleHole: holeNumber })
      await refresh()
      addToast(`Hole ${holeNumber} set as double points`, 'success')
    } catch {
      addToast('Save failed', 'error')
    }
  }, [refresh, addToast])

  if (!isAdmin) return <div className={styles.denied}>Admin access required</div>

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Course Setup</h2>
      <p className={styles.subtitle}>{config.courseName || 'Set course name in config'}</p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Hole</th>
              <th>Par</th>
              <th>HCP</th>
              <th>2x</th>
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
                <td className={styles.doubleCol}>
                  <button
                    className={`${styles.doubleBtn} ${config.doubleHole === h.number ? styles.doubleBtnActive : ''}`}
                    onClick={() => handleDoubleHole(h.number)}
                  >
                    {config.doubleHole === h.number ? '★' : '○'}
                  </button>
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
        {config.doubleHole > 0 && <span>Double Points: Hole {config.doubleHole}</span>}
      </div>
    </div>
  )
}
