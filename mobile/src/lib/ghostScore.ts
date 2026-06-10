import type { GhostRun } from '../types'

export interface GhostScoreResult {
  score: number
  dataPoints: { x: number; y: number }[]  // one per run, x = run index (1-based), y = cumulative score
}

/**
 * Computes a 0-based performance score from a list of ghost runs.
 *
 * Score increases when pace improves run-over-run, decreases when pace worsens,
 * but never goes below 0. Uses pace delta (s/km) halved as the point unit,
 * capped at ±50 per run to prevent single outlier runs dominating.
 *
 * Runs must be sorted chronologically (oldest first) by the caller.
 */
export function computeGhostScore(runs: GhostRun[]): GhostScoreResult {
  if (runs.length === 0) return { score: 0, dataPoints: [] }

  const sorted = [...runs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const dataPoints: { x: number; y: number }[] = []
  let score = 0

  // First run establishes baseline — score stays 0, still plotted
  dataPoints.push({ x: 1, y: 0 })

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]

    // Positive delta = pace improved (lower s/km = faster)
    const paceDelta = prev.avg_pace_s_per_km - curr.avg_pace_s_per_km
    const contribution = Math.max(-50, Math.min(50, Math.round(paceDelta / 2)))

    score = Math.max(0, score + contribution)
    dataPoints.push({ x: i + 1, y: score })
  }

  return { score, dataPoints }
}
