import { useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { TeamRow, PlayerRow, HoleDetail } from '../lib/scoring'
import styles from './Leaderboard.module.css'

interface Props {
  teamRows: TeamRow[]
  playerRows: PlayerRow[]
}

export function Leaderboard({ teamRows, playerRows }: Props) {
  const { currentUser } = useAuth()
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null)

  const toggleTeam = useCallback((id: string) => {
    setExpandedTeam(prev => prev === id ? null : id)
  }, [])

  const togglePlayer = useCallback((id: string) => {
    setExpandedPlayer(prev => prev === id ? null : id)
  }, [])

  const formatNet = (net: number) => {
    if (net > 0) return `+${net}`
    if (net === 0) return 'E'
    return `${net}`
  }

  return (
    <div className={styles.container}>
      {/* Team Leaderboard */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thTeam}>Team</th>
              <th className={styles.thNum}>Points</th>
              <th className={styles.thNum}>Behind</th>
              <th className={styles.thNum}>Thru</th>
            </tr>
          </thead>
          <tbody>
            {teamRows.map(row => {
              const isMyTeam = !!(currentUser?.teamId && row.playerTotals.some(p => p.userId === currentUser.id))
              const isOpen = expandedTeam === row.teamId
              return (
                <TeamRowView key={row.teamId} row={row} isMyTeam={isMyTeam} isOpen={isOpen} onToggle={() => toggleTeam(row.teamId)} />
              )
            })}
            {teamRows.length === 0 && (
              <tr><td colSpan={4} className={styles.empty}>No teams yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Individual Leaderboard */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thTeam}>Player</th>
              <th className={styles.thNum}>Points</th>
              <th className={styles.thNum}>Net</th>
              <th className={styles.thNum}>Thru</th>
            </tr>
          </thead>
          <tbody>
            {playerRows.map(row => {
              const isMe = currentUser?.id === row.userId
              const isOpen = expandedPlayer === row.userId
              return (
                <IndivRowView key={row.userId} row={row} isMe={isMe} isOpen={isOpen} onToggle={() => togglePlayer(row.userId)} formatNet={formatNet} />
              )
            })}
            {playerRows.length === 0 && (
              <tr><td colSpan={4} className={styles.empty}>No players yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function initials(fullName: string, lastName: string): string {
  const parts = fullName.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  // fallback: first char of fullName + first char of lastName
  return ((fullName[0] ?? '') + (lastName[0] ?? '')).toUpperCase()
}

/** Team row — expands to show both players' strips with shared hole header */
function TeamRowView({ row, isMyTeam, isOpen, onToggle }: {
  row: TeamRow; isMyTeam: boolean; isOpen: boolean; onToggle: () => void
}) {
  return (
    <>
      <tr className={`${isMyTeam ? styles.myRow : ''} ${isOpen ? styles.rowOpen : ''}`} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td className={styles.tdTeam}>{row.teamName}</td>
        <td className={styles.tdNum}>{row.totalPoints}</td>
        <td className={styles.tdNum}>{row.behind === null ? '—' : row.behind}</td>
        <td className={styles.tdNum}>{row.thru}</td>
      </tr>
      {isOpen && (
        <tr className={styles.detailRow}>
          <td colSpan={4} className={styles.detailCell}>
            <ScorecardGrid players={row.playerTotals.map(pt => ({
              label: initials(pt.fullName, pt.name),
              name: pt.name,
              pops: pt.pops,
              pts: pt.totalPoints,
              details: pt.holeDetails,
            }))} />
          </td>
        </tr>
      )}
    </>
  )
}

/** Individual player row — expands to single strip */
function IndivRowView({ row, isMe, isOpen, onToggle, formatNet }: {
  row: PlayerRow; isMe: boolean; isOpen: boolean; onToggle: () => void; formatNet: (n: number) => string
}) {
  return (
    <>
      <tr className={`${isMe ? styles.myRow : ''} ${isOpen ? styles.rowOpen : ''}`} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td className={styles.tdTeam}>{row.name} <span className={styles.pops}>({row.pops})</span></td>
        <td className={styles.tdNum}>{row.totalPoints}</td>
        <td className={styles.tdNum}>{formatNet(row.totalNet)}</td>
        <td className={styles.tdNum}>{row.holesPlayed}</td>
      </tr>
      {isOpen && row.holeDetails && (
        <tr className={styles.detailRow}>
          <td colSpan={4} className={styles.detailCell}>
            <ScorecardGrid players={[{
              label: initials(row.fullName ?? row.name, row.name),
              name: row.name,
              pops: row.pops,
              pts: row.totalPoints,
              details: row.holeDetails,
            }]} />
          </td>
        </tr>
      )}
    </>
  )
}

interface GridPlayer {
  label: string
  name: string
  pops: number
  pts: number
  details: HoleDetail[]
}

/** Scorecard grid: hole numbers on top, then a row per player — all 18 in one line */
function ScorecardGrid({ players }: { players: GridPlayer[] }) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1)

  return (
    <div className={styles.scorecardGrid}>
      {/* Hole number header row */}
      <div className={styles.gridRow}>
        <div className={styles.gridLabel}></div>
        {holes.map(h => (
          <div key={h} className={styles.gridHoleNum}>{h}</div>
        ))}
      </div>
      {/* Player score rows + pop dot rows */}
      {players.map(p => {
        const sorted = [...p.details].sort((a, b) => a.holeNumber - b.holeNumber)
        const hasPops = sorted.some(d => d.strokesReceived > 0)
        return (
          <div key={p.label + p.name}>
            <div className={styles.gridRow}>
              <div className={styles.gridLabel}>{p.label}</div>
              {holes.map(h => {
                const d = sorted.find(x => x.holeNumber === h)
                return <ScoreCell key={h} d={d} />
              })}
            </div>
            {hasPops && (
              <div className={styles.gridRow}>
                <div className={styles.gridLabel}></div>
                {holes.map(h => {
                  const d = sorted.find(x => x.holeNumber === h)
                  const hasScore = d?.grossScore !== null && d?.grossScore !== undefined
                  const strokes = d?.strokesReceived ?? 0
                  return (
                    <div key={h} className={styles.gridPopCell}>
                      {hasScore && strokes > 0 ? <span className={`${styles.gridPops} ${(d?.points ?? 0) > 0 ? styles.popsScored : styles.popsNoPoints}`}>{'●'.repeat(strokes)}</span> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScoreCell({ d }: { d: HoleDetail | undefined }) {
  if (!d) return <div className={styles.gridCell}><span className={styles.gridScore}>·</span></div>

  const hasScore = d.grossScore !== null
  const scored = hasScore && d.points > 0

  return (
    <div className={`${styles.gridCell} ${hasScore ? (scored ? styles.scScored : styles.scNoPoints) : ''}`}>
      <span className={styles.gridScore}>{hasScore ? d.grossScore : '·'}</span>
    </div>
  )
}
