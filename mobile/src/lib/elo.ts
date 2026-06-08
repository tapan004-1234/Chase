const K = 32

export interface ELOResult {
  challengerDelta:        number
  recordHolderDelta:      number
  challengerNewRating:    number
  recordHolderNewRating:  number
}

// Symmetric ELO — mirrors the formula in the design doc
export function calculateELO(
  challengerRating:   number,
  recordHolderRating: number,
  challengerWon:      boolean
): ELOResult {
  const expected       = 1 / (1 + Math.pow(10, (recordHolderRating - challengerRating) / 400))
  const score          = challengerWon ? 1 : 0
  const challengerDelta = Math.round(K * (score - expected))
  const recordHolderDelta = -challengerDelta

  return {
    challengerDelta,
    recordHolderDelta,
    challengerNewRating:   challengerRating   + challengerDelta,
    recordHolderNewRating: recordHolderRating + recordHolderDelta,
  }
}
