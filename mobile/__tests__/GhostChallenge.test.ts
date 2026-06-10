import { evaluateGhostResult, shouldUpdateGhostChallenge } from '../src/lib/GhostChallenge'
import type { GhostParameters } from '../src/types'

// ── evaluateGhostResult ────────────────────────────────────────────────────

describe('evaluateGhostResult', () => {
  it('wins when run covers the distance faster', () => {
    expect(evaluateGhostResult(5, 1600, 5, 1500)).toBe('win')
  })
  it('loses when run is slower', () => {
    expect(evaluateGhostResult(5, 1400, 5, 1500)).toBe('loss')
  })
  it('loses on exact tie', () => {
    expect(evaluateGhostResult(5, 1500, 5, 1500)).toBe('loss')
  })
  it('loses when run falls short of challenge distance', () => {
    expect(evaluateGhostResult(5, 1600, 4.9, 1500)).toBe('loss')
  })
})

// ── shouldUpdateGhostChallenge — REGRESSION: self-challenge guard ──────────
//
// Bug history: PostRunScreen previously called ghost_challenges.update()
// unconditionally when ghost was present. Self-challenges (no challengeId)
// caused a DB write to a non-existent row, producing a silent error on every
// run save. Fix: guard on ghost.challengeId.

describe('shouldUpdateGhostChallenge — self-challenge guard', () => {
  const selfChallenge: GhostParameters = {
    // challengeId intentionally absent — user running against their own past run
    challengeDistanceKm: 5,
    challengeDurationSeconds: 1600,
    opponentUsername: 'me',
  }

  const realChallenge: GhostParameters = {
    challengeId: 'chal-abc123',
    challengerUserId: 'opponent-456',
    challengeDistanceKm: 5,
    challengeDurationSeconds: 1600,
    opponentUsername: 'them',
  }

  describe('self-challenge (no challengeId)', () => {
    it('returns false — must not touch ghost_challenges', () => {
      expect(shouldUpdateGhostChallenge(selfChallenge, 'win')).toBe(false)
    })
    it('returns false even on a loss', () => {
      expect(shouldUpdateGhostChallenge(selfChallenge, 'loss')).toBe(false)
    })
  })

  describe('real ghost challenge (challengeId present)', () => {
    it('returns true on win', () => {
      expect(shouldUpdateGhostChallenge(realChallenge, 'win')).toBe(true)
    })
    it('returns true on loss', () => {
      expect(shouldUpdateGhostChallenge(realChallenge, 'loss')).toBe(true)
    })
    it('returns false when result is null (not yet evaluated)', () => {
      expect(shouldUpdateGhostChallenge(realChallenge, null)).toBe(false)
    })
  })

  describe('free run (no ghost at all)', () => {
    it('returns false', () => {
      expect(shouldUpdateGhostChallenge(undefined, null)).toBe(false)
    })
  })
})
