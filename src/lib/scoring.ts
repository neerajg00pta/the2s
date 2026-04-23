import type { Hole, Score, User, Team } from './types'

/**
 * How many strokes a player receives on a given hole.
 * pops 0-18: 1 stroke on hardest N holes (handicap 1..N)
 * pops 19-36: 2 strokes on hardest (pops-18) holes, 1 on the rest
 */
export function getStrokesOnHole(pops: number, holeHandicap: number): number {
  if (pops <= 0) return 0
  if (pops <= 18) {
    return holeHandicap <= pops ? 1 : 0
  }
  // pops > 18
  const doubleStrokeHoles = pops - 18
  if (holeHandicap <= doubleStrokeHoles) return 2
  return 1 // all remaining holes get 1
}

/** Net score relative to par (negative = under par) */
export function getNetScore(grossScore: number, par: number, strokesReceived: number): number {
  return grossScore - par - strokesReceived
}

/** Stableford points for a hole: max(0, 2 - netScore), doubled if double hole */
export function getPoints(netScore: number, isDoubleHole: boolean): number {
  const base = Math.max(0, 2 - netScore)
  return isDoubleHole ? base * 2 : base
}

export interface HoleDetail {
  holeNumber: number
  par: number
  handicap: number
  grossScore: number | null
  strokesReceived: number
  netScore: number | null
  points: number
  isDoubleHole: boolean
}

export interface PlayerTotals {
  userId: string
  name: string
  fullName: string
  pops: number
  totalPoints: number
  totalNet: number
  holesPlayed: number
  holeDetails: HoleDetail[]
}

export function getPlayerTotals(
  user: User,
  scores: Score[],
  holes: Hole[],
  doubleHole: number
): PlayerTotals {
  const playerScores = scores.filter(s => s.userId === user.id)
  const scoreMap = new Map(playerScores.map(s => [s.holeNumber, s.grossScore]))

  let totalPoints = 0
  let totalNet = 0
  let holesPlayed = 0
  const holeDetails: HoleDetail[] = []

  for (const hole of holes) {
    const gross = scoreMap.get(hole.number) ?? null
    const strokesReceived = getStrokesOnHole(user.pops, hole.handicap)
    const isDouble = hole.number === doubleHole
    let netScore: number | null = null
    let points = 0

    if (gross !== null) {
      netScore = getNetScore(gross, hole.par, strokesReceived)
      points = getPoints(netScore, isDouble)
      totalPoints += points
      totalNet += netScore
      holesPlayed++
    }

    holeDetails.push({
      holeNumber: hole.number,
      par: hole.par,
      handicap: hole.handicap,
      grossScore: gross,
      strokesReceived,
      netScore,
      points,
      isDoubleHole: isDouble,
    })
  }

  return { userId: user.id, name: user.name, fullName: user.fullName, pops: user.pops, totalPoints, totalNet, holesPlayed, holeDetails }
}

export interface TeamRow {
  teamId: string
  teamName: string
  totalPoints: number
  behind: number | null
  thru: number
  playerTotals: PlayerTotals[]
}

export function buildTeamLeaderboard(
  teams: Team[],
  users: User[],
  scores: Score[],
  holes: Hole[],
  doubleHole: number
): TeamRow[] {
  const rows: TeamRow[] = teams.map(team => {
    const teamUsers = users.filter(u => u.teamId === team.id)
    const playerTotals = teamUsers.map(u => getPlayerTotals(u, scores, holes, doubleHole))

    // Team points only count holes where ALL players have scored
    let totalPoints = 0
    let thru = 0
    for (const hole of holes) {
      const allScored = playerTotals.every(pt => {
        const d = pt.holeDetails.find(h => h.holeNumber === hole.number)
        return d && d.grossScore !== null
      })
      if (allScored) {
        thru++
        for (const pt of playerTotals) {
          const d = pt.holeDetails.find(h => h.holeNumber === hole.number)!
          totalPoints += d.points
        }
      }
    }

    return { teamId: team.id, teamName: team.name, totalPoints, behind: null, thru, playerTotals }
  })

  rows.sort((a, b) => b.totalPoints - a.totalPoints || a.teamName.localeCompare(b.teamName))

  const leaderPoints = rows[0]?.totalPoints ?? 0
  for (const row of rows) {
    row.behind = row.totalPoints === leaderPoints ? null : leaderPoints - row.totalPoints
  }

  return rows
}

export interface PlayerRow {
  userId: string
  name: string
  fullName: string
  pops: number
  totalPoints: number
  totalNet: number
  holesPlayed: number
  teamName: string
  holeDetails: HoleDetail[]
}

export function buildIndividualLeaderboard(
  teams: Team[],
  users: User[],
  scores: Score[],
  holes: Hole[],
  doubleHole: number
): PlayerRow[] {
  const teamMap = new Map(teams.map(t => [t.id, t.name]))
  const rows: PlayerRow[] = users
    .filter(u => u.teamId)
    .map(u => {
      const totals = getPlayerTotals(u, scores, holes, doubleHole)
      return {
        userId: u.id,
        name: u.name,
        fullName: u.fullName,
        pops: u.pops,
        totalPoints: totals.totalPoints,
        totalNet: totals.totalNet,
        holesPlayed: totals.holesPlayed,
        teamName: teamMap.get(u.teamId!) ?? '',
        holeDetails: totals.holeDetails,
      }
    })

  rows.sort((a, b) => b.totalPoints - a.totalPoints || a.totalNet - b.totalNet || a.name.localeCompare(b.name))
  return rows
}

export interface ProgressionPoint {
  hole: number
  [teamName: string]: number | null // cumulative points per team, null = no data yet
}

export function buildProgressionData(
  teams: Team[],
  users: User[],
  scores: Score[],
  holes: Hole[],
  doubleHole: number
): ProgressionPoint[] {
  const sortedHoles = [...holes].sort((a, b) => a.number - b.number)
  const teamData = teams.map(team => {
    const teamUsers = users.filter(u => u.teamId === team.id)
    const playerTotalsArr = teamUsers.map(u => getPlayerTotals(u, scores, holes, doubleHole))
    return { name: team.name, playerTotals: playerTotalsArr }
  })

  const points: ProgressionPoint[] = []
  for (let i = 0; i < sortedHoles.length; i++) {
    const holeNum = sortedHoles[i].number
    const point: ProgressionPoint = { hole: holeNum }
    for (const td of teamData) {
      // Check if this hole is completed by all players
      const thisHoleComplete = td.playerTotals.every(pt => {
        const d = pt.holeDetails.find(x => x.holeNumber === holeNum)
        return d && d.grossScore !== null
      })

      if (!thisHoleComplete) {
        // No data for this hole onward — use null so Recharts stops the line
        point[td.name] = null
      } else {
        let cumulative = 0
        for (let j = 0; j <= i; j++) {
          const h = sortedHoles[j].number
          const allScored = td.playerTotals.every(pt => {
            const d = pt.holeDetails.find(x => x.holeNumber === h)
            return d && d.grossScore !== null
          })
          if (allScored) {
            for (const pt of td.playerTotals) {
              const d = pt.holeDetails.find(x => x.holeNumber === h)!
              cumulative += d.points
            }
          }
        }
        point[td.name] = cumulative
      }
    }
    points.push(point)
  }
  return points
}

/** 10-color palette for team chart lines */
export const TEAM_COLORS = [
  '#1f77b4', '#ff7f0e', '#d62728', '#9467bd', '#2ca02c',
  '#e377c2', '#17becf', '#bcbd22', '#8c564b', '#7f7f7f',
]
