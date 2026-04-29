import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useData } from '../contexts/DataContext'
import { buildProgressionData, getDoubleHole, TEAM_COLORS } from '../lib/scoring'
import styles from './ProgressGraph.module.css'

function playerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return fullName.slice(0, 2).toUpperCase()
}

export function ProgressGraph() {
  const { users, teams, holes, scores } = useData()

  const data = useMemo(
    () => buildProgressionData(teams, users, scores, holes, getDoubleHole(holes)),
    [teams, users, scores, holes]
  )

  const teamNames = useMemo(() => teams.map(t => t.name), [teams])

  // Build team initials and last names maps
  const teamInitials = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      const members = users.filter(u => u.teamId === team.id)
      const initials = members.map(m => playerInitials(m.fullName || m.name)).join('/')
      map.set(team.name, initials)
    }
    return map
  }, [teams, users])

  const teamLastNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      const members = users.filter(u => u.teamId === team.id)
      const names = members.map(m => m.name).join('/')
      map.set(team.name, names)
    }
    return map
  }, [teams, users])

  // Color map for tooltip
  const colorMap = useMemo(() => {
    const map = new Map<string, string>()
    teamNames.forEach((name, i) => map.set(name, TEAM_COLORS[i % TEAM_COLORS.length]))
    return map
  }, [teamNames])

  if (teams.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No teams created yet</p>
      </div>
    )
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
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="hole"
              stroke="var(--text-muted)"
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
            />
            <YAxis
              stroke="var(--text-muted)"
              tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
              domain={[0, Math.ceil((maxPoints + 5) / 5) * 5]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const entries = payload
                  .filter(p => p.value !== null && p.value !== undefined)
                  .map(p => ({ name: p.dataKey as string, value: p.value as number, color: p.color ?? '#fff' }))
                  .sort((a, b) => b.value - a.value)
                return (
                  <div className={styles.tooltip}>
                    {entries.map(e => (
                      <div key={e.name} style={{ color: e.color }}>
                        {teamInitials.get(e.name) ?? e.name}: {e.value}
                      </div>
                    ))}
                  </div>
                )
              }}
              position={{ x: 35, y: 8 }}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 12, display: 'flex', justifyContent: 'center' }}
              formatter={(value: string) => (
                <span style={{ color: colorMap.get(value) ?? 'var(--text-secondary)' }}>
                  {teamLastNames.get(value) ?? value}
                </span>
              )}
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
    </div>
  )
}
