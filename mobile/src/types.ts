export interface GPSPoint {
  latitude: number
  longitude: number
  timestamp: number
  horizontalAccuracy: number
}

export interface RunRecord {
  distanceKm: number
  durationSeconds: number
  avgPaceSecondsPerKm: number
  gpsPoints: GPSPoint[]
  startedAt: string  // ISO 8601
  endedAt: string
}

export interface GhostParameters {
  challengeId?:             string   // undefined for self-challenges (no DB row)
  challengerUserId?:        string
  challengeDistanceKm:      number
  challengeDurationSeconds: number
  opponentUsername:         string
}

export interface LiveRunState {
  distanceKm: number
  elapsedSeconds: number
  currentPaceSecondsPerKm: number
  ghostDeltaMetres: number | null   // positive = ahead of ghost
  ghostDeltaSeconds: number | null  // positive = time banked
}

export interface Profile {
  id: string
  username: string
  username_set: boolean
  ghost_rating: number
  tag_rating: number
  bounty_rating: number
  apns_device_token: string | null
}

export interface GhostRun {
  id: string
  user_id: string
  distance_km: number
  duration_s: number
  avg_pace_s_per_km: number
  created_at: string
}

export interface GhostChallenge {
  id: string
  challenger_id: string
  opponent_id: string
  challenger_run_id: string
  opponent_run_id: string | null
  winner_id: string | null
  status: 'pending' | 'completed' | 'expired'
  expires_at: string
  created_at: string
  // joined fields
  challenger?: Profile
  opponent?: Profile
  challenger_run?: GhostRun
}

export interface BountyChallenge {
  id: string
  challenger_id: string
  opponent_id: string | null
  challenger_run_id: string
  opponent_run_id: string | null
  winner_id: string | null
  status: 'pending' | 'completed' | 'expired'
  is_public: boolean
  expires_at: string
  created_at: string
  // joined
  challenger?: Profile
  opponent?: Profile
  challenger_run?: GhostRun
}

export interface BountyParameters {
  bountyId: string
  challengerUserId: string
  opponentUsername: string
  challengeDistanceKm: number
  challengeDurationSeconds: number
  challengerRun: GhostRun
  isPublic: boolean
}

export type AppMode = 'Tag' | 'Bounty' | 'Ghost'

export type TagRole = 'police' | 'thief'

export interface TagParameters {
  lobbyCode:        string
  myRole:           TagRole
  opponentProfile:  Profile
  durationMinutes:  number
  headStartMetres:  number   // max(0, min(500, (police_rating - thief_rating) * 0.5))
}

export interface Lobby {
  id:               string
  code:             string
  host_id:          string
  guest_id:         string | null
  host_ready:       boolean
  guest_ready:      boolean
  duration_minutes: number
  status:           'waiting' | 'active' | 'completed'
  expires_at:       string
  created_at:       string
  // joined
  host?:            Profile
  guest?:           Profile
}
