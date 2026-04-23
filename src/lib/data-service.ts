import { supabase } from './supabase'
import type { Config, User, Team, Hole, Score, AllData } from './types'

// ── Fetch all ──────────────────────────────────────────────

export async function fetchAllData(): Promise<AllData> {
  const [configRes, usersRes, teamsRes, holesRes, scoresRes] = await Promise.all([
    supabase.from('the2s_config').select('*').single(),
    supabase.from('the2s_users').select('*').order('created_at', { ascending: true }),
    supabase.from('the2s_teams').select('*').order('created_at', { ascending: true }),
    supabase.from('the2s_holes').select('*').order('number', { ascending: true }),
    supabase.from('the2s_scores').select('*'),
  ])

  if (configRes.error) throw new Error(`Config: ${configRes.error.message}`)
  if (usersRes.error) throw new Error(`Users: ${usersRes.error.message}`)
  if (teamsRes.error) throw new Error(`Teams: ${teamsRes.error.message}`)
  if (holesRes.error) throw new Error(`Holes: ${holesRes.error.message}`)
  if (scoresRes.error) throw new Error(`Scores: ${scoresRes.error.message}`)

  const raw = configRes.data
  const config: Config = {
    poolLocked: raw.pool_locked ?? false,
    liveScoring: raw.live_scoring ?? false,
    doubleHole: raw.double_hole ?? 0,
    courseName: raw.course_name ?? '',
    tournamentName: raw.tournament_name ?? 'The 2s',
  }

  const users: User[] = (usersRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    fullName: (r.full_name as string) ?? '',
    email: r.email as string,
    admin: (r.admin as boolean) ?? false,
    pops: (r.pops as number) ?? 0,
    teamId: (r.team_id as string) ?? null,
    createdAt: r.created_at as string,
  }))

  const teams: Team[] = (teamsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    createdAt: r.created_at as string,
  }))

  const holes: Hole[] = (holesRes.data ?? []).map((r: Record<string, unknown>) => ({
    number: r.number as number,
    par: r.par as number,
    handicap: r.handicap as number,
  }))

  const scores: Score[] = (scoresRes.data ?? []).map((r: Record<string, unknown>) => ({
    userId: r.user_id as string,
    holeNumber: r.hole_number as number,
    grossScore: r.gross_score as number,
    updatedAt: r.updated_at as string,
  }))

  return { config, users, teams, holes, scores }
}

// ── Config ──────────────────────────────────────────────

export async function updateConfig(updates: Partial<{
  poolLocked: boolean
  liveScoring: boolean
  doubleHole: number
  courseName: string
  tournamentName: string
}>): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (updates.poolLocked !== undefined) payload.pool_locked = updates.poolLocked
  if (updates.liveScoring !== undefined) payload.live_scoring = updates.liveScoring
  if (updates.doubleHole !== undefined) payload.double_hole = updates.doubleHole
  if (updates.courseName !== undefined) payload.course_name = updates.courseName
  if (updates.tournamentName !== undefined) payload.tournament_name = updates.tournamentName

  const { error } = await supabase.from('the2s_config').update(payload).eq('id', 1)
  if (error) throw new Error(error.message)
}

// ── Users ──────────────────────────────────────────────

export async function createUser(input: {
  name: string
  email: string
  fullName: string
  pops?: number
  teamId?: string
  admin?: boolean
}): Promise<User> {
  const id = `u${Date.now()}`
  const { data, error } = await supabase
    .from('the2s_users')
    .insert({
      id,
      name: input.name,
      full_name: input.fullName,
      email: input.email.toLowerCase(),
      pops: input.pops ?? 0,
      team_id: input.teamId ?? null,
      admin: input.admin ?? false,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name ?? '',
    email: data.email,
    admin: data.admin ?? false,
    pops: data.pops ?? 0,
    teamId: data.team_id ?? null,
    createdAt: data.created_at,
  }
}

export async function updateUser(userId: string, updates: Partial<{
  name: string
  fullName: string
  email: string
  admin: boolean
  pops: number
  teamId: string | null
}>): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.fullName !== undefined) payload.full_name = updates.fullName
  if (updates.email !== undefined) payload.email = updates.email
  if (updates.admin !== undefined) payload.admin = updates.admin
  if (updates.pops !== undefined) payload.pops = updates.pops
  if (updates.teamId !== undefined) payload.team_id = updates.teamId

  const { error } = await supabase.from('the2s_users').update(payload).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function deleteUser(userId: string): Promise<void> {
  await supabase.from('the2s_scores').delete().eq('user_id', userId)
  const { error } = await supabase.from('the2s_users').delete().eq('id', userId)
  if (error) throw new Error(error.message)
}

// ── Teams ──────────────────────────────────────────────

export async function createTeam(name: string): Promise<Team> {
  const id = `t${Date.now()}`
  const { data, error } = await supabase
    .from('the2s_teams')
    .insert({ id, name })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id, name: data.name, createdAt: data.created_at }
}

export async function updateTeam(teamId: string, name: string): Promise<void> {
  const { error } = await supabase.from('the2s_teams').update({ name }).eq('id', teamId)
  if (error) throw new Error(error.message)
}

export async function deleteTeam(teamId: string): Promise<void> {
  // Unassign users from this team
  await supabase.from('the2s_users').update({ team_id: null }).eq('team_id', teamId)
  const { error } = await supabase.from('the2s_teams').delete().eq('id', teamId)
  if (error) throw new Error(error.message)
}

// ── Holes ──────────────────────────────────────────────

export async function updateHole(holeNumber: number, updates: Partial<{
  par: number
  handicap: number
}>): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (updates.par !== undefined) payload.par = updates.par
  if (updates.handicap !== undefined) payload.handicap = updates.handicap

  const { error } = await supabase.from('the2s_holes').update(payload).eq('number', holeNumber)
  if (error) throw new Error(error.message)
}

export async function bulkUpdateHoles(holes: Array<{ number: number; par: number; handicap: number }>): Promise<void> {
  for (const h of holes) {
    const { error } = await supabase
      .from('the2s_holes')
      .update({ par: h.par, handicap: h.handicap })
      .eq('number', h.number)
    if (error) throw new Error(error.message)
  }
}

// ── Scores ──────────────────────────────────────────────

export async function upsertScore(userId: string, holeNumber: number, grossScore: number): Promise<void> {
  const { error } = await supabase
    .from('the2s_scores')
    .upsert(
      { user_id: userId, hole_number: holeNumber, gross_score: grossScore, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,hole_number' }
    )
  if (error) throw new Error(error.message)
}

export async function deleteScore(userId: string, holeNumber: number): Promise<void> {
  const { error } = await supabase
    .from('the2s_scores')
    .delete()
    .eq('user_id', userId)
    .eq('hole_number', holeNumber)
  if (error) throw new Error(error.message)
}
