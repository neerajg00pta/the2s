import { useMemo, useRef, useCallback } from 'react'
import { useData } from '../contexts/DataContext'
import { buildTeamLeaderboard, getStrokesOnHole, getNetScore, getPoints, getDoubleHole } from '../lib/scoring'
import styles from './LatestTicker.module.css'

function playerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return fullName.slice(0, 2).toUpperCase()
}

interface TickerItem {
  rank: number
  teamLabel: string
  points: number
  holeNumber: number
}

export function LatestTicker() {
  const { users, teams, holes, scores } = useData()

  const items = useMemo(() => {
    if (!teams.length || !scores.length || !holes.length) return []

    const holeMap = new Map(holes.map(h => [h.number, h]))
    const teamRows = buildTeamLeaderboard(teams, users, scores, holes, getDoubleHole(holes))
    const result: TickerItem[] = []

    for (let rank = 0; rank < teamRows.length; rank++) {
      const row = teamRows[rank]
      const members = users.filter(u => u.teamId === row.teamId)
      if (!members.length) continue

      const teamLabel = members.map(m => playerInitials(m.fullName || m.name)).join('/')

      // Find the highest hole where BOTH players have a score
      const scoresByHole = new Map<number, string[]>()
      for (const s of scores) {
        if (!members.some(m => m.id === s.userId)) continue
        const arr = scoresByHole.get(s.holeNumber) ?? []
        arr.push(s.userId)
        scoresByHole.set(s.holeNumber, arr)
      }

      let latestHole = 0
      for (const [h, uids] of scoresByHole) {
        if (members.every(m => uids.includes(m.id)) && h > latestHole) {
          latestHole = h
        }
      }

      if (!latestHole) continue
      const hole = holeMap.get(latestHole)
      if (!hole) continue

      // Sum both players' points on that hole
      let holePts = 0
      for (const m of members) {
        const s = scores.find(sc => sc.userId === m.id && sc.holeNumber === latestHole)
        if (!s) continue
        const strokes = getStrokesOnHole(m.pops, hole.handicap)
        const net = getNetScore(s.grossScore, hole.par, strokes)
        holePts += getPoints(net, latestHole === getDoubleHole(holes))
      }

      result.push({ rank: rank + 1, teamLabel, points: holePts, holeNumber: latestHole })
    }

    return result
  }, [users, teams, holes, scores, getDoubleHole(holes)])

  // Drag-to-scroll
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const track = trackRef.current
    if (!track) return
    dragging.current = true
    startX.current = e.clientX
    scrollLeft.current = track.scrollLeft
    track.setPointerCapture(e.pointerId)
    track.classList.add(styles.trackDragging)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !trackRef.current) return
    const dx = e.clientX - startX.current
    trackRef.current.scrollLeft = scrollLeft.current - dx
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
    trackRef.current?.classList.remove(styles.trackDragging)
  }, [])

  if (!items.length) return null

  // Double the items for seamless loop
  const tickerContent = [...items, ...items]

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Latest</span>
      <div
        className={styles.track}
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className={styles.scroll}>
          {tickerContent.map((item, i) => (
            <span key={i} className={styles.item}>
              <span className={styles.rank}>{item.rank}.</span>
              <span className={styles.team}>{item.teamLabel}</span>
              {' '}
              <span className={styles.pts}>+{item.points}</span>
              {' '}
              <span className={styles.hole}>@{item.holeNumber}</span>
              <span className={styles.sep}>|</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
