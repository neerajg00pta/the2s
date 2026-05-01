import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useData } from '../contexts/DataContext'
import { buildProgressionData, buildTeamLeaderboard, getDoubleHole, TEAM_COLORS } from '../lib/scoring'
import styles from './ProgressGraph.module.css'

function playerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return fullName.slice(0, 2).toUpperCase()
}

export function ProgressGraph() {
  const { users, teams, holes, scores } = useData()
  const [activeHole, setActiveHole] = useState<number | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const doubleHole = getDoubleHole(holes)

  const data = useMemo(
    () => buildProgressionData(teams, users, scores, holes, doubleHole),
    [teams, users, scores, holes, doubleHole]
  )

  const teamRows = useMemo(
    () => buildTeamLeaderboard(teams, users, scores, holes, doubleHole),
    [teams, users, scores, holes, doubleHole]
  )

  const teamNames = useMemo(() => teams.map(t => t.name), [teams])

  const teamInitials = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      const members = users.filter(u => u.teamId === team.id)
      map.set(team.name, members.map(m => playerInitials(m.fullName || m.name)).join('/'))
    }
    return map
  }, [teams, users])

  const teamLastNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      const members = users.filter(u => u.teamId === team.id)
      map.set(team.name, members.map(m => m.name).join('/'))
    }
    return map
  }, [teams, users])

  const colorMap = useMemo(() => {
    const map = new Map<string, string>()
    teamNames.forEach((name, i) => map.set(name, TEAM_COLORS[i % TEAM_COLORS.length]))
    return map
  }, [teamNames])

  // Outside click → revert to default
  useEffect(() => {
    const handler = (e: Event) => {
      if (chartRef.current && !chartRef.current.contains(e.target as Node)) {
        setActiveHole(null)
      }
    }
    const scrollReset = () => setActiveHole(null)
    document.addEventListener('click', handler, true)
    document.addEventListener('touchend', handler, true)
    window.addEventListener('scroll', scrollReset, { passive: true })
    return () => {
      document.removeEventListener('click', handler, true)
      document.removeEventListener('touchend', handler, true)
      window.removeEventListener('scroll', scrollReset)
    }
  }, [])

  // Build info panel content
  const infoContent = useMemo(() => {
    if (activeHole !== null) {
      // Show scores at specific hole
      const point = data.find(d => d.hole === activeHole)
      if (!point) return null
      const entries = teamNames
        .map(name => ({ name, value: point[name], color: colorMap.get(name) ?? '#fff' }))
        .filter(e => typeof e.value === 'number' && e.value !== null)
        .sort((a, b) => (b.value as number) - (a.value as number))
      return { label: `Hole ${activeHole}`, entries: entries.map(e => ({ initials: teamInitials.get(e.name) ?? '', value: e.value as number, color: e.color })) }
    } else {
      // Default: show team totals + thru (like ticker)
      const entries = teamRows
        .map(r => ({ initials: teamInitials.get(r.teamName) ?? '', total: r.totalPoints, thru: r.thru, color: colorMap.get(r.teamName) ?? '#fff' }))
      return { label: null, entries: entries.map(e => ({ initials: e.initials, value: e.total, thru: e.thru, color: e.color })) }
    }
  }, [activeHole, data, teamNames, teamRows, teamInitials, colorMap])

  const onTooltipActive = useCallback((_active: boolean, payload: Array<Record<string, unknown>> | undefined) => {
    if (payload?.length) {
      const hole = (payload[0] as Record<string, unknown>).payload as Record<string, unknown>
      if (typeof hole?.hole === 'number') setActiveHole(hole.hole)
    }
  }, [])

  if (teams.length === 0) {
    return <div className={styles.empty}><p>No teams created yet</p></div>
  }

  const maxPoints = data.reduce((max, point) => {
    for (const name of teamNames) {
      const val = point[name]
      if (typeof val === 'number' && val > max) max = val
    }
    return max
  }, 0)

  return (
    <div className={styles.container}>
      {/* Always-visible info panel */}
      <div className={styles.infoPanel}>
        {infoContent && (
          <>
            {infoContent.label && <span className={styles.infoLabel}>{infoContent.label}: </span>}
            {infoContent.entries.map((e, i) => (
              <span key={i} className={styles.infoEntry}>
                <span style={{ color: e.color }}>{e.initials}</span>
                <span style={{ color: e.color }} className={styles.infoValue}>
                  {e.value}{'thru' in e && (e as { thru?: number }).thru !== undefined ? ` @${(e as { thru?: number }).thru}` : ''}
                </span>
                {i < infoContent.entries.length - 1 && <span className={styles.infoSep}>|</span>}
              </span>
            ))}
          </>
        )}
      </div>

      <div className={styles.chartWrap} ref={chartRef}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="hole"
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            />
            <YAxis
              stroke="var(--text-muted)"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              width={25}
              domain={[0, Math.ceil((maxPoints + 5) / 5) * 5]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.length) onTooltipActive(true, payload as unknown as Array<Record<string, unknown>>)
                return null
              }}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
            />
            {teamNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={TEAM_COLORS[i % TEAM_COLORS.length]}
                strokeWidth={1}
                dot={{ r: 2, fill: TEAM_COLORS[i % TEAM_COLORS.length] }}
                activeDot={{ r: 4 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={styles.legend}>
        {teamNames.map((name, i) => (
          <span key={name} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
            <span style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }}>{teamLastNames.get(name) ?? name}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
