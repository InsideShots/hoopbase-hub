// HoopBase Player Profiles — owner-controlled, cross-team, lifelong.
// Backed by public.player_profiles (extended) + player_profile_seasons +
// player_career_games + profile_viewers. RLS enforces visibility on the server.

import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const SUMMARY_COLS = [
  'id','full_name','owner_email','is_public','is_data_maintained','theme','theme_config',
  'photo_url','player_photo_url','player_uid','public_uid','jersey_number','positions',
  'height_cm','weight_kg','dominant_hand','dob','hometown','bio','created_at','updated_at',
].join(',')

export async function fetchHoopBaseProfile(profileId) {
  if (!profileId) return null
  const { data } = await supabase
    .from('player_profiles')
    .select(SUMMARY_COLS)
    .eq('id', profileId)
    .single()
  return data || null
}

export async function fetchHoopBaseProfileForOwner(email) {
  const v = String(email || '').trim().toLowerCase()
  if (!v) return null
  const { data } = await supabase
    .from('player_profiles')
    .select(SUMMARY_COLS)
    .ilike('owner_email', v)
    .order('created_at', { ascending: false })
    .limit(1)
  return Array.isArray(data) && data[0] ? data[0] : null
}

export async function listSeasons(profileId) {
  if (!profileId) return []
  const { data } = await supabase
    .from('player_profile_seasons')
    .select('*')
    .eq('profile_id', profileId)
    .order('year', { ascending: false })
  return Array.isArray(data) ? data : []
}

export async function listCareerGames(profileId, { limit = 200 } = {}) {
  if (!profileId) return []
  const { data } = await supabase
    .from('player_career_games')
    .select('*')
    .eq('profile_id', profileId)
    .order('played_on', { ascending: false })
    .limit(limit)
  return Array.isArray(data) ? data : []
}

export async function listViewers(profileId) {
  if (!profileId) return []
  const { data } = await supabase
    .from('profile_viewers')
    .select('id, viewer_email, granted_at, granted_by, note')
    .eq('profile_id', profileId)
    .order('granted_at', { ascending: false })
  return Array.isArray(data) ? data : []
}

export async function addViewer(profileId, email, { note = null, grantedBy = null } = {}) {
  const v = String(email || '').trim().toLowerCase()
  if (!profileId || !v) throw new Error('profileId and email required')
  const { data, error } = await supabase
    .from('profile_viewers')
    .insert({ profile_id: profileId, viewer_email: v, note, granted_by: grantedBy })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeViewer(viewerRowId) {
  if (!viewerRowId) return
  const { error } = await supabase
    .from('profile_viewers')
    .delete()
    .eq('id', viewerRowId)
  if (error) throw error
}

export async function updateProfile(profileId, patch) {
  if (!profileId) throw new Error('profileId required')
  const { data, error } = await supabase
    .from('player_profiles')
    .update(patch)
    .eq('id', profileId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function backfillProfileStats(profileId) {
  if (!profileId) throw new Error('profileId required')
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || null
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hb_backfill_profile_stats`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_profile_id: profileId }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.message || data?.hint || `RPC failed (${res.status})`)
  }
  return data
}

export function ageFromDob(dob) {
  const v = String(dob || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  const mDelta = (today.getMonth() + 1) - m
  if (mDelta < 0 || (mDelta === 0 && today.getDate() < d)) age -= 1
  return age
}

export const MINOR_AGE_THRESHOLD = 16

export async function createHoopBaseProfile({ ownerEmail, fullName, dob, playhqUid, forceMinor = false }) {
  const email = String(ownerEmail || '').trim().toLowerCase()
  const name = String(fullName || '').trim()
  if (!email) throw new Error('ownerEmail required')
  if (!name) throw new Error('fullName required')
  const age = ageFromDob(dob)
  const isMinor = forceMinor || (age != null && age < MINOR_AGE_THRESHOLD)
  const payload = {
    owner_email: email,
    full_name: name,
    dob: dob || null,
    age_at_creation: age,
    is_minor: isMinor,
    consent_status: isMinor ? 'pending' : 'not_required',
    player_uid: playhqUid ? String(playhqUid).trim() : null,
    is_data_maintained: !!playhqUid,
    theme: 'light',
    is_public: false,
  }
  const { data, error } = await supabase
    .from('player_profiles')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchConsentTextVersion(version = 'v1.0') {
  const { data } = await supabase
    .from('consent_text_versions')
    .select('id, version, effective_date, source_path, sha256_hash, notes')
    .eq('version', version)
    .single()
  return data || null
}

export async function fetchActiveConsent(profileId) {
  if (!profileId) return null
  const { data } = await supabase
    .from('player_profile_consents')
    .select('*')
    .eq('profile_id', profileId)
    .order('signed_at', { ascending: false })
    .limit(1)
  return Array.isArray(data) && data[0] ? data[0] : null
}

export async function createConsentRecord(profileId, {
  consentTextVersionId,
  parentName,
  parentEmail,
  parentPhone,
  parentRelationship,
  documentStoragePath = null,
}) {
  if (!profileId) throw new Error('profileId required')
  const payload = {
    profile_id: profileId,
    consent_text_version_id: consentTextVersionId,
    parent_name: String(parentName || '').trim(),
    parent_email: String(parentEmail || '').trim().toLowerCase(),
    parent_phone: String(parentPhone || '').trim() || null,
    parent_relationship: String(parentRelationship || '').trim(),
    signature_typed_name: null,
    signed_user_agent: null,
    document_storage_path: documentStoragePath,
    status: 'pending',
  }
  if (!payload.parent_name || !payload.parent_email || !payload.parent_relationship) {
    throw new Error('parent_name, parent_email and parent_relationship are required')
  }
  const { error: pErr } = await supabase
    .from('player_profiles')
    .update({ parent_email: payload.parent_email, parent_name: payload.parent_name, parent_phone: payload.parent_phone, parent_relationship: payload.parent_relationship, consent_text_version_id: consentTextVersionId })
    .eq('id', profileId)
  if (pErr) throw pErr
  const { data, error } = await supabase
    .from('player_profile_consents')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchConsentByToken(token) {
  if (!token) throw new Error('token required')
  const { data, error } = await supabase.rpc('hb_fetch_consent_by_token', { p_token: token })
  if (error) throw error
  return data || null
}

export async function approveConsentByTokenWithSignature(token, signatureTypedName) {
  if (!token) throw new Error('token required')
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || null
  const { data, error } = await supabase.rpc('hb_approve_consent_by_token', {
    p_token: token,
    p_signature_typed_name: signatureTypedName,
    p_user_agent: ua,
  })
  if (error) throw error
  return data
}

export async function approveConsentByToken(token) {
  if (!token) throw new Error('token required')
  const { data: rows, error: fErr } = await supabase
    .from('player_profile_consents')
    .select('id, profile_id, status')
    .eq('confirmation_token', token)
    .limit(1)
  if (fErr) throw fErr
  const row = Array.isArray(rows) && rows[0]
  if (!row) throw new Error('Consent not found or already used')
  if (row.status === 'approved') return { profile_id: row.profile_id, already: true }
  if (row.status === 'revoked') throw new Error('This consent has been revoked')
  const now = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('player_profile_consents')
    .update({ status: 'approved', approved_at: now })
    .eq('id', row.id)
  if (uErr) throw uErr
  const { error: pErr } = await supabase
    .from('player_profiles')
    .update({ consent_status: 'approved', consent_approved_at: now })
    .eq('id', row.profile_id)
  if (pErr) throw pErr
  return { profile_id: row.profile_id, already: false }
}

export async function revokeConsent(consentId, profileId) {
  if (!consentId || !profileId) throw new Error('consentId and profileId required')
  const now = new Date().toISOString()
  const { error: uErr } = await supabase
    .from('player_profile_consents')
    .update({ status: 'revoked', revoked_at: now })
    .eq('id', consentId)
  if (uErr) throw uErr
  const { error: pErr } = await supabase
    .from('player_profiles')
    .update({ consent_status: 'revoked', consent_revoked_at: now })
    .eq('id', profileId)
  if (pErr) throw pErr
}

export async function listLinkCandidates(profileId) {
  if (!profileId) return []
  const { data } = await supabase
    .from('hb_profile_link_candidates')
    .select('profile_id, player_id, team_id, team_name, player_name, already_linked_to')
    .eq('profile_id', profileId)
  return Array.isArray(data) ? data : []
}

export async function listLinkedTeams(profileId) {
  if (!profileId) return []
  const { data } = await supabase
    .from('players')
    .select('id, name, jersey_number, team_id, profile_linked_at, teams(name)')
    .eq('player_profile_id', profileId)
  return Array.isArray(data) ? data : []
}

export async function linkPlayerToProfile(playerId, profileId) {
  if (!playerId || !profileId) throw new Error('playerId and profileId required')
  const { error } = await supabase.rpc('hb_link_player_to_profile', {
    p_player_id: playerId,
    p_profile_id: profileId,
  })
  if (error) throw error
}

export async function unlinkPlayerFromProfile(playerId) {
  if (!playerId) throw new Error('playerId required')
  const { error } = await supabase.rpc('hb_unlink_player_from_profile', {
    p_player_id: playerId,
  })
  if (error) throw error
}

export async function fetchPlayerLinkStatus(playerId) {
  if (!playerId) return null
  const { data } = await supabase
    .from('players')
    .select('id, player_profile_id, profile_linked_at')
    .eq('id', playerId)
    .single()
  return data || null
}

export async function listConsentAudit(profileId, { limit = 50 } = {}) {
  if (!profileId) return []
  const { data } = await supabase
    .from('consent_audit_log')
    .select('*')
    .eq('profile_id', profileId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  return Array.isArray(data) ? data : []
}

export async function createSeason(profileId, payload) {
  if (!profileId) throw new Error('profileId required')
  const row = {
    profile_id: profileId,
    year: Number(payload?.year),
    team_name: String(payload?.team_name || '').trim(),
    league: payload?.league || null,
    age_group: payload?.age_group || null,
    jersey_number: payload?.jersey_number || null,
    photo_url: payload?.photo_url || null,
    notes: payload?.notes || null,
  }
  if (!row.year || !row.team_name) throw new Error('year and team_name required')
  const { data, error } = await supabase
    .from('player_profile_seasons')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSeason(seasonId, patch) {
  if (!seasonId) throw new Error('seasonId required')
  const { data, error } = await supabase
    .from('player_profile_seasons')
    .update(patch)
    .eq('id', seasonId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSeason(seasonId) {
  if (!seasonId) return
  const { error } = await supabase.from('player_profile_seasons').delete().eq('id', seasonId)
  if (error) throw error
}

export async function createGame(profileId, payload) {
  if (!profileId) throw new Error('profileId required')
  const stats = payload?.stats && typeof payload.stats === 'object' ? payload.stats : {}
  const row = {
    profile_id: profileId,
    season_id: payload?.season_id || null,
    played_on: payload?.played_on || null,
    opponent: payload?.opponent || null,
    home_or_away: payload?.home_or_away || null,
    result: payload?.result || null,
    team_score: payload?.team_score == null || payload?.team_score === '' ? null : Number(payload.team_score),
    opponent_score: payload?.opponent_score == null || payload?.opponent_score === '' ? null : Number(payload.opponent_score),
    stats,
    video_url: payload?.video_url || null,
    video_timecode_seconds: payload?.video_timecode_seconds == null || payload?.video_timecode_seconds === '' ? null : Number(payload.video_timecode_seconds),
    notes: payload?.notes || null,
  }
  const { data, error } = await supabase
    .from('player_career_games')
    .insert(row)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGame(gameId, patch) {
  if (!gameId) throw new Error('gameId required')
  const { data, error } = await supabase
    .from('player_career_games')
    .update(patch)
    .eq('id', gameId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteGame(gameId) {
  if (!gameId) return
  const { error } = await supabase.from('player_career_games').delete().eq('id', gameId)
  if (error) throw error
}

export function parseTimecode(input) {
  const v = String(input || '').trim()
  if (!v) return null
  if (/^\d+$/.test(v)) return Number(v)
  const m = v.match(/^(\d+):(\d{1,2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const m2 = v.match(/^(\d+)m\s*(\d+)?s?$/i)
  if (m2) return Number(m2[1]) * 60 + Number(m2[2] || 0)
  return null
}

export function computeCareerAverages(games) {
  const list = Array.isArray(games) ? games : []
  if (!list.length) return { gp: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, mpg: 0 }
  let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, min = 0, gp = 0
  for (const g of list) {
    const s = g?.stats || {}
    pts += Number(s.points ?? s.pts ?? 0) || 0
    reb += Number(s.rebounds ?? s.reb ?? 0) || 0
    ast += Number(s.assists ?? s.ast ?? 0) || 0
    stl += Number(s.steals ?? s.stl ?? 0) || 0
    blk += Number(s.blocks ?? s.blk ?? 0) || 0
    min += Number(s.minutes ?? s.min ?? 0) || 0
    gp += 1
  }
  const r = (n) => Math.round((n / gp) * 10) / 10
  return { gp, ppg: r(pts), rpg: r(reb), apg: r(ast), spg: r(stl), bpg: r(blk), mpg: r(min) }
}
