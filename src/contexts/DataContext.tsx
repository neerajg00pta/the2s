import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Config, User, Team, Hole, Score } from '../lib/types'
import { fetchAllData } from '../lib/data-service'
import { POLL_INTERVAL_MS } from '../lib/config'

interface DataState {
  config: Config
  users: User[]
  teams: Team[]
  holes: Hole[]
  scores: Score[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  tick: number
}

const DataContext = createContext<DataState | null>(null)

const DEFAULT_CONFIG: Config = {
  poolLocked: false,
  liveScoring: false,
  doubleHole: 0,
  courseName: '',
  tournamentName: 'The 2s',
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [users, setUsers] = useState<User[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [holes, setHoles] = useState<Hole[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAllData()
      setConfig(data.config)
      setUsers(data.users)
      setTeams(data.teams)
      setHoles(data.holes)
      setScores(data.scores)
      setError(null)
      setTick(t => t + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <DataContext.Provider value={{ config, users, teams, holes, scores, loading, error, refresh, tick }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
