import { evaluateGhostResult } from '../src/lib/GhostChallenge'

// ── evaluateBountyResult — reuses evaluateGhostResult under the hood ──────────
//
// Bounty win condition: the challenger posted a run with (distance, duration).
// The acceptor wins if they cover the same distance in less time than the
// challenger's duration (same semantics as ghost challenge evaluation).

describe('evaluateBountyResult', () => {
  describe('win cases', () => {
    it('wins when acceptor runs the distance faster', () => {
      // Challenger: 5 km in 1600s (320 s/km)
      // Acceptor:   5 km in 1500s (300 s/km) — faster
      expect(evaluateGhostResult(5, 1600, 5, 1500)).toBe('win')
    })

    it('wins when runner covers challenge distance faster than challenger pace', () => {
      // Challenger: 5 km in 2000s (400 s/km)
      // Acceptor:   5 km in 1800s (360 s/km) — covers full distance faster
      expect(evaluateGhostResult(5, 2000, 5, 1800)).toBe('win')
    })
  })

  describe('loss cases', () => {
    it('loses when slower than the challenger', () => {
      expect(evaluateGhostResult(5, 1400, 5, 1500)).toBe('loss')
    })

    it('loses on exact tie (same time = challenger wins their own bounty)', () => {
      expect(evaluateGhostResult(5, 1500, 5, 1500)).toBe('loss')
    })

    it('loses when acceptor stops short of challenge distance', () => {
      expect(evaluateGhostResult(5, 1600, 4.9, 1500)).toBe('loss')
    })

    it('loses on a 0 km run (did not start)', () => {
      expect(evaluateGhostResult(5, 1600, 0, 0)).toBe('loss')
    })
  })
})

// ── ELO delta formula ────────────────────────────────────────────────────────
//
// delta = round(K * (outcome - expected))
// expected = 1 / (1 + 10^((opponent - me) / 400))
// K = 32

const K = 32

function eloExpected(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400))
}

function eloDelta(myRating: number, opponentRating: number, win: boolean): number {
  const expected = eloExpected(myRating, opponentRating)
  return Math.round(K * ((win ? 1 : 0) - expected))
}

describe('ELO delta', () => {
  it('evenly matched players: win earns ~+16, loss costs ~-16', () => {
    const win  = eloDelta(1200, 1200, true)
    const loss = eloDelta(1200, 1200, false)
    expect(win).toBe(16)
    expect(loss).toBe(-16)
  })

  it('beating a much stronger opponent earns a large bonus', () => {
    // Me: 1000, opponent: 1400 — very unlikely win
    const delta = eloDelta(1000, 1400, true)
    expect(delta).toBeGreaterThan(25)
  })

  it('losing to a much weaker opponent costs a large penalty', () => {
    // Me: 1400, opponent: 1000 — expected to win easily
    const delta = eloDelta(1400, 1000, false)
    expect(delta).toBeLessThan(-25)
  })

  it('winning against a weak opponent earns little', () => {
    // Me: 1400, opponent: 1000
    const delta = eloDelta(1400, 1000, true)
    expect(delta).toBeGreaterThan(0)
    expect(delta).toBeLessThan(8)
  })

  it('win delta is positive, loss delta is negative', () => {
    const win  = eloDelta(1300, 1100, true)
    const loss = eloDelta(1300, 1100, false)
    expect(win).toBeGreaterThan(0)
    expect(loss).toBeLessThan(0)
  })

  it('equal players: absolute values of win and loss sum to K (before rounding)', () => {
    // For evenly matched players rounding produces K/2 + K/2 = K
    const win  = eloDelta(1200, 1200, true)
    const loss = eloDelta(1200, 1200, false)
    expect(Math.abs(win) + Math.abs(loss)).toBe(K)
  })
})
