export interface Config {
  poolLocked: boolean
  liveScoring: boolean
  doubleHole: number
  courseName: string
  tournamentName: string
}

export interface User {
  id: string
  name: string
  fullName: string
  email: string
  admin: boolean
  pops: number
  teamId: string | null
  createdAt: string
}

export interface Team {
  id: string
  name: string
  createdAt: string
}

export type HoleDesignation = '2x' | 'iii' | 'tips' | null

export interface Hole {
  number: number
  par: number
  handicap: number
  designation: HoleDesignation
}

export interface Score {
  userId: string
  holeNumber: number
  grossScore: number
  updatedAt: string
}

export interface AllData {
  config: Config
  users: User[]
  teams: Team[]
  holes: Hole[]
  scores: Score[]
}
