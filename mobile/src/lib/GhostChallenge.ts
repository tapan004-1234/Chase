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
