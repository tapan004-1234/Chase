function pad(n: number): string { return n.toString().padStart(2, '0') }

/** Duration as "m:ss" or "h:mm:ss" — unpadded leading minute, for stat displays */
export function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

/** Duration as "mm:ss" or "h:mm:ss" — always-padded, for stopwatch displays */
export function fmtElapsed(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

/** Pace as "m:ss /km" — for standalone pace display */
export function fmtPace(spk: number): string {
  if (spk <= 0 || !isFinite(spk)) return '--:--'
  return `${Math.floor(spk / 60)}:${pad(Math.floor(spk % 60))} /km`
}

/** Pace as "m:ss" — for display next to a separate "Pace" label */
export function fmtPaceShort(spk: number): string {
  if (spk <= 0 || !isFinite(spk)) return '--:--'
  return `${Math.floor(spk / 60)}:${pad(Math.floor(spk % 60))}`
}
