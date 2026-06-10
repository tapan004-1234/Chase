import { computeGhostScore } from '../src/lib/ghostScore'
import type { GhostRun } from '../src/types'

function makeRun(avg_pace_s_per_km: number, created_at: string): GhostRun {
  return {
    id:                `run-${created_at}`,
    user_id:           'user-1',
    distance_km:       5,
    duration_s:        avg_pace_s_per_km * 5,
    avg_pace_s_per_km,
    gps_points:        [],
    created_at,
  }
}

describe('computeGhostScore', () => {
  it('returns score 0 and empty dataPoints for no runs', () => {
    const { score, dataPoints } = computeGhostScore([])
    expect(score).toBe(0)
    expect(dataPoints).toHaveLength(0)
  })

  it('returns score 0 for a single run (baseline)', () => {
    const runs = [makeRun(360, '2024-01-01')]
    const { score, dataPoints } = computeGhostScore(runs)
    expect(score).toBe(0)
    expect(dataPoints).toHaveLength(1)
    expect(dataPoints[0]).toEqual({ x: 1, y: 0 })
  })

  it('increases score when pace improves (lower s/km)', () => {
    const runs = [
      makeRun(360, '2024-01-01'),  // 6:00/km baseline
      makeRun(320, '2024-01-02'),  // 5:20/km — 40s faster
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    // paceDelta = 360 - 320 = 40, contribution = round(40/2) = 20
    expect(score).toBe(20)
    expect(dataPoints[1].y).toBe(20)
  })

  it('decreases score when pace worsens (higher s/km)', () => {
    const runs = [
      makeRun(320, '2024-01-01'),
      makeRun(360, '2024-01-02'),  // 40s slower
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    // paceDelta = 320 - 360 = -40, contribution = round(-40/2) = -20
    // score = max(0, 0 + (-20)) = 0
    expect(score).toBe(0)
    expect(dataPoints[1].y).toBe(0)
  })

  it('never drops below 0 (floor at zero)', () => {
    const runs = [
      makeRun(300, '2024-01-01'),  // fast
      makeRun(400, '2024-01-02'),  // much slower (-50 contribution, capped)
      makeRun(450, '2024-01-03'),  // even slower
    ]
    const { score } = computeGhostScore(runs)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('caps single-run contribution at +50', () => {
    const runs = [
      makeRun(500, '2024-01-01'),  // very slow baseline
      makeRun(100, '2024-01-02'),  // extremely fast — 400s delta
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    // paceDelta = 400, uncapped = 200, capped at 50
    expect(score).toBe(50)
    expect(dataPoints[1].y).toBe(50)
  })

  it('caps single-run contribution at -50', () => {
    const runs = [
      makeRun(100, '2024-01-01'),  // very fast baseline
      makeRun(500, '2024-01-02'),  // extremely slow — -400s delta
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    // contribution = max(-50, min(50, round(-400/2))) = -50
    // score = max(0, 0 + (-50)) = 0 (floored)
    expect(score).toBe(0)
    expect(dataPoints[1].y).toBe(0)
  })

  it('accumulates across multiple improving runs', () => {
    const runs = [
      makeRun(360, '2024-01-01'),
      makeRun(340, '2024-01-02'),  // +10
      makeRun(320, '2024-01-03'),  // +10
      makeRun(300, '2024-01-04'),  // +10
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    expect(score).toBe(30)
    expect(dataPoints).toHaveLength(4)
    expect(dataPoints[0]).toEqual({ x: 1, y: 0 })
    expect(dataPoints[1]).toEqual({ x: 2, y: 10 })
    expect(dataPoints[2]).toEqual({ x: 3, y: 20 })
    expect(dataPoints[3]).toEqual({ x: 4, y: 30 })
  })

  it('sorts runs chronologically regardless of input order', () => {
    const runs = [
      makeRun(340, '2024-01-02'),  // intentionally out of order
      makeRun(360, '2024-01-01'),
    ]
    const { score } = computeGhostScore(runs)
    // Correct order: 360 → 340, delta = +20, contribution = +10
    expect(score).toBe(10)
  })

  it('recovers after a dip: score bounces back from 0', () => {
    const runs = [
      makeRun(360, '2024-01-01'),
      makeRun(360, '2024-01-02'),  // same pace — score stays 0
      makeRun(320, '2024-01-03'),  // improved — should increase
    ]
    const { score, dataPoints } = computeGhostScore(runs)
    // run2: delta=0, contribution=0, score=0
    // run3: delta=40, contribution=20, score=20
    expect(score).toBe(20)
    expect(dataPoints[2].y).toBe(20)
  })
})
