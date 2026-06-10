import type { GhostParameters } from '../types'

// Ghost win condition (T3) — matches design doc Decision 1:
// Challenger wins if they ran >= challenge_distance_km in < challenge_duration_s.
// Runs that end short of the challenge distance count as automatic losses.

export function evaluateGhostResult(
  challengeDistanceKm:      number,
  challengeDurationSeconds: number,
  runDistanceKm:            number,
  runDurationSeconds:       number
): 'win' | 'loss' {
  if (runDistanceKm < challengeDistanceKm) return 'loss'
  return runDurationSeconds < challengeDurationSeconds ? 'win' : 'loss'
}

// Guard: only write to ghost_challenges when there is a real challenge row to update.
// Self-challenges (run-against-yourself) have no challengeId, so the DB row
// does not exist and must not be touched.
export function shouldUpdateGhostChallenge(
  ghost: GhostParameters | undefined,
  result: 'win' | 'loss' | null,
): boolean {
  return !!(ghost && ghost.challengeId && result)
}
