import { useState, useCallback } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { createUser, updateUser, deleteUser, createTeam, updateTeam, deleteTeam, updateConfig } from '../lib/data-service'
import { getStrokesOnHole, getNetScore, getPoints, getDoubleHole } from '../lib/scoring'
import styles from './AdminPanel.module.css'

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? '').slice(0, 8)
}

export function AdminPanel() {
  const { isAdmin } = useAuth()
  const { config, users, teams, holes, scores, refresh } = useData()
  const { addToast } = useToast()

  // New player form
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPops, setNewPops] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)

  // New team
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [teamP1, setTeamP1] = useState('')
  const [teamP2, setTeamP2] = useState('')

  if (!isAdmin) return <div className={styles.denied}>Admin access required</div>

  const unassignedPlayers = users.filter(u => !u.teamId)

  const handleAddPlayer = async () => {
    if (!newFullName.trim() || !newEmail.trim()) return
    setAddingPlayer(true)
    try {
      const ln = lastName(newFullName)
      await createUser({ name: ln, email: newEmail.trim().toLowerCase(), fullName: newFullName.trim(), pops: parseInt(newPops) || 0 })
      await refresh()
      setNewFullName(''); setNewEmail(''); setNewPops('')
      addToast('Player added', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setAddingPlayer(false)
    }
  }

  const handleCreateTeam = async () => {
    if (!teamP1 || !teamP2 || teamP1 === teamP2) return
    setCreatingTeam(true)
    try {
      const p1 = users.find(u => u.id === teamP1)
      const p2 = users.find(u => u.id === teamP2)
      const name = `${p1?.name ?? '?'}/${p2?.name ?? '?'}`
      const team = await createTeam(name)
      await updateUser(teamP1, { teamId: team.id })
      await updateUser(teamP2, { teamId: team.id })
      await refresh()
      setTeamP1(''); setTeamP2('')
      addToast('Team created', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error')
    } finally {
      setCreatingTeam(false)
    }
  }

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm('Delete this team?')) return
    try {
      await deleteTeam(teamId)
      await refresh()
      addToast('Team deleted', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  const handleDeletePlayer = async (userId: string) => {
    if (!confirm('Delete this player and all their scores?')) return
    try {
      await deleteUser(userId)
      await refresh()
      addToast('Player deleted', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  const handleToggleLock = async () => {
    try {
      await updateConfig({ poolLocked: !config.poolLocked })
      await refresh()
      addToast(config.poolLocked ? 'Tournament unlocked' : 'Tournament locked', 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error')
    }
  }

  const copyInviteLink = (email: string) => {
    const link = `${window.location.origin}${window.location.pathname}#/?token=${encodeURIComponent(email)}`
    navigator.clipboard.writeText(link)
    addToast('Invite link copied', 'success')
  }

  const handleExportCSV = () => {
    const doubleHole = getDoubleHole(holes)
    const sortedHoles = [...holes].sort((a, b) => a.number - b.number)
    const teamMap = new Map(teams.map(t => [t.id, t.name]))
    const scoreMap = new Map(scores.map(s => [`${s.userId}-${s.holeNumber}`, s.grossScore]))

    const header = 'Team,Player,Pops,Hole,Par,HCP,Designation,Strokes,Gross,Net,NetVsPar,Points'
    const rows: string[] = []

    const sortedUsers = [...users].filter(u => u.teamId).sort((a, b) => {
      const ta = teamMap.get(a.teamId!) ?? ''
      const tb = teamMap.get(b.teamId!) ?? ''
      return ta.localeCompare(tb) || a.name.localeCompare(b.name)
    })

    for (const u of sortedUsers) {
      const teamName = teamMap.get(u.teamId!) ?? ''
      for (const h of sortedHoles) {
        const strokes = getStrokesOnHole(u.pops, h.handicap)
        const gross = scoreMap.get(`${u.id}-${h.number}`)
        const isDouble = h.number === doubleHole
        let net = '', netVsPar = '', pts = ''
        if (gross !== undefined) {
          const n = getNetScore(gross, h.par, strokes)
          const p = getPoints(n, isDouble)
          net = String(gross - strokes)
          netVsPar = String(n)
          pts = String(p)
        }
        rows.push([
          teamName, u.name, u.pops, h.number, h.par, h.handicap,
          h.designation ?? '', strokes,
          gross ?? '', net, netVsPar, pts
        ].join(','))
      }
    }

    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'the2s-scores.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.container}>
      {/* Lock toggle */}
      <div className={styles.lockSection}>
        <button className={`${styles.lockBtn} ${config.poolLocked ? styles.locked : ''}`} onClick={handleToggleLock}>
          {config.poolLocked ? '🔒 Tournament Locked' : '🔓 Lock Tournament'}
        </button>
        {config.poolLocked && <p className={styles.lockNote}>Teams, players, and course are locked. Scores can still be entered.</p>}
        <button className={styles.exportBtn} onClick={handleExportCSV}>Export CSV</button>
      </div>

      {/* Teams — disabled when locked */}
      <section className={`${styles.section} ${config.poolLocked ? styles.sectionLocked : ''}`}>
        <h3>Teams ({teams.length})</h3>
        {teams.map(team => {
          const members = users.filter(u => u.teamId === team.id)
          return (
            <div key={team.id} className={styles.teamCard}>
              <div className={styles.teamName}>{team.name}</div>
              <div className={styles.teamMembers}>
                {members.map(m => (
                  <span key={m.id} className={styles.memberChip}>
                    {m.name} ({m.pops})
                    <button className={styles.unassignBtn} onClick={async () => {
                      await updateUser(m.id, { teamId: null })
                      await refresh()
                      addToast(`${m.name} unassigned`, 'info')
                    }} title="Remove from team">✕</button>
                  </span>
                ))}
                {members.length < 2 && (
                  <select className={styles.assignSelect} value="" onChange={async (e) => {
                    const uid = e.target.value
                    if (!uid) return
                    await updateUser(uid, { teamId: team.id })
                    // Update team name
                    const updatedMembers = [...members.map(m => m.name), users.find(u => u.id === uid)?.name ?? '']
                    await updateTeam(team.id, updatedMembers.join('/'))
                    await refresh()
                    addToast('Player assigned', 'success')
                  }}>
                    <option value="">+ Add player...</option>
                    {unassignedPlayers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.pops})</option>)}
                  </select>
                )}
              </div>
              <button className={styles.deleteBtn} onClick={() => handleDeleteTeam(team.id)}>✕</button>
            </div>
          )
        })}

        {/* Unassigned players */}
        {unassignedPlayers.length > 0 && (
          <div className={styles.unassigned}>
            <span className={styles.unassignedLabel}>Unassigned:</span>
            {unassignedPlayers.map(u => <span key={u.id} className={styles.unassignedChip}>{u.name} ({u.pops})</span>)}
          </div>
        )}

        {/* Create new team */}
        <div className={styles.createTeam}>
          <select value={teamP1} onChange={e => setTeamP1(e.target.value)} className={styles.select}>
            <option value="">Player 1...</option>
            {unassignedPlayers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.pops})</option>)}
          </select>
          <select value={teamP2} onChange={e => setTeamP2(e.target.value)} className={styles.select}>
            <option value="">Player 2...</option>
            {unassignedPlayers.filter(u => u.id !== teamP1).map(u => <option key={u.id} value={u.id}>{u.name} ({u.pops})</option>)}
          </select>
          <button className={styles.actionBtn} onClick={handleCreateTeam} disabled={creatingTeam || !teamP1 || !teamP2}>
            + New Team
          </button>
        </div>
      </section>

      {/* Players — disabled when locked */}
      <section className={`${styles.section} ${config.poolLocked ? styles.sectionLocked : ''}`}>
        <h3>Players ({users.length})</h3>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Email</th>
                <th>Pops</th>
                <th>Admin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <PlayerRow key={u.id} user={u} onUpdate={refresh} onDelete={handleDeletePlayer} onCopyLink={copyInviteLink} addToast={addToast} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Add player form */}
        <div className={styles.addForm}>
          <input placeholder="Full Name" value={newFullName} onChange={e => setNewFullName(e.target.value)} className={styles.input} />
          <input placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={styles.input} type="email" />
          <input placeholder="Pops" value={newPops} onChange={e => setNewPops(e.target.value)} className={styles.inputXs} type="number" min={0} max={36} />
          <button className={styles.actionBtn} onClick={handleAddPlayer} disabled={addingPlayer || !newFullName.trim() || !newEmail.trim()}>
            + Add
          </button>
        </div>
      </section>
    </div>
  )
}

/** Inline-editable player row — saves on blur */
function PlayerRow({ user, onUpdate, onDelete, onCopyLink, addToast }: {
  user: { id: string; fullName: string; name: string; email: string; pops: number; admin: boolean }
  onUpdate: () => Promise<void>
  onDelete: (id: string) => void
  onCopyLink: (email: string) => void
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [fullName, setFullName] = useState(user.fullName)
  const [email, setEmail] = useState(user.email)
  const [pops, setPops] = useState(String(user.pops))

  const saveField = useCallback(async (updates: Record<string, string | number | boolean>) => {
    try {
      await updateUser(user.id, updates)
      await onUpdate()
    } catch {
      addToast('Save failed', 'error')
    }
  }, [user.id, onUpdate, addToast])

  return (
    <tr>
      <td>
        <input
          className={styles.cellInput}
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          onBlur={() => {
            const trimmed = fullName.trim()
            if (!trimmed || trimmed === user.fullName) return
            saveField({ fullName: trimmed, name: lastName(trimmed) })
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInput}
          value={email}
          onChange={e => setEmail(e.target.value)}
          onBlur={() => {
            const trimmed = email.trim()
            if (!trimmed || trimmed === user.email) return
            saveField({ email: trimmed })
          }}
        />
      </td>
      <td>
        <input
          className={styles.cellInputXs}
          type="number"
          min={0}
          max={36}
          value={pops}
          onChange={e => setPops(e.target.value)}
          onBlur={() => {
            const n = parseInt(pops)
            if (isNaN(n) || n === user.pops) return
            if (n < 0 || n > 36) return
            saveField({ pops: n })
          }}
        />
      </td>
      <td>
        <input
          type="checkbox"
          checked={user.admin}
          onChange={e => saveField({ admin: e.target.checked })}
        />
      </td>
      <td className={styles.actions}>
        <button className={styles.linkBtn} onClick={() => onCopyLink(user.email)} title="Copy invite link">🔗</button>
        <button className={styles.deleteBtn} onClick={() => onDelete(user.id)} title="Delete">✕</button>
      </td>
    </tr>
  )
}
