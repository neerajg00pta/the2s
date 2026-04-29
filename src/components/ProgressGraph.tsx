import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer } from 'recharts'
import { useData } from '../contexts/DataContext'
import { buildProgressionData, getDoubleHole, TEAM_COLORS } from '../lib/scoring'
import styles from './ProgressGraph.module.css'

export function ProgressGraph() {
  const { users, teams, holes, scores } = useData()

  const data = useMemo(
    () => buildProgressionData(teams, users, scores, holes, getDoubleHole(holes)),
    [teams, users, scores, holes, getDoubleHole(holes)]
  )

  const teamNames = useMemo(() => teams.map(t => t.name), [teams])

  if (teams.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No teams created yet</p>
      </div>
    )
  }

  // Find max points for Y axis
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
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
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
            <Legend
              wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}
              align="center"
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
