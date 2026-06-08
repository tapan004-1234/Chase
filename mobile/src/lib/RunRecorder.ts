import { useRef, useState, useCallback } from 'react'
import * as Location from 'expo-location'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import type { GPSPoint, GhostParameters, LiveRunState, RunRecord } from '../types'

const KEEP_AWAKE_TAG = 'chase-run'

// ── Ghost math (mirrors GhostParameters in RunRecorder.swift) ──────────────

function ghostPaceSecondsPerKm(p: GhostParameters): number {
  return p.challengeDistanceKm > 0
    ? p.challengeDurationSeconds / p.challengeDistanceKm
    : 0
}

function ghostVirtualDistanceKm(p: GhostParameters, elapsedSeconds: number): number {
  const pace = ghostPaceSecondsPerKm(p)
  return pace > 0 ? elapsedSeconds / pace : 0
}

// ── Distance calculation ───────────────────────────────────────────────────

function haversineMetres(a: GPSPoint, b: GPSPoint): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function totalDistanceMetres(points: GPSPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMetres(points[i - 1], points[i])
  }
  return total
}

// ── Hook ──────────────────────────────────────────────────────────────────

const INITIAL_STATE: LiveRunState = {
  distanceKm: 0,
  elapsedSeconds: 0,
  currentPaceSecondsPerKm: 0,
  ghostDeltaMetres: null,
  ghostDeltaSeconds: null,
}

export function useRunRecorder() {
  const [liveState,   setLiveState]   = useState<LiveRunState>(INITIAL_STATE)
  const [isRecording, setIsRecording] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [userCoord,   setUserCoord]   = useState<{ latitude: number; longitude: number } | null>(null)

  const subscription  = useRef<Location.LocationSubscription | null>(null)
  const points        = useRef<GPSPoint[]>([])
  const startDate     = useRef<Date | null>(null)
  const ghostRef      = useRef<GhostParameters | null>(null)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  const tick = useCallback(() => {
    if (!startDate.current) return
    const elapsed = (Date.now() - startDate.current.getTime()) / 1000
    const metres  = totalDistanceMetres(points.current)
    const km      = metres / 1000
    const pace    = km > 0 ? elapsed / km : 0

    let ghostDeltaMetres:  number | null = null
    let ghostDeltaSeconds: number | null = null

    if (ghostRef.current) {
      const ghostKm  = ghostVirtualDistanceKm(ghostRef.current, elapsed)
      const deltaKm  = km - ghostKm
      ghostDeltaMetres  = deltaKm * 1000
      ghostDeltaSeconds = deltaKm * ghostPaceSecondsPerKm(ghostRef.current)
    }

    setLiveState({
      distanceKm:              km,
      elapsedSeconds:          Math.floor(elapsed),
      currentPaceSecondsPerKm: pace,
      ghostDeltaMetres,
      ghostDeltaSeconds,
    })
  }, [])

  const startRun = useCallback(async (ghost?: GhostParameters) => {
    setError(null)
    ghostRef.current  = ghost ?? null
    points.current    = []

    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      setError('Location permission denied. Go to Settings → Chase → Location and choose "While Using".')
      return
    }

    // Request background ("Always") so GPS continues when screen locks.
    // Non-fatal — foreground-only still works; iOS shows its own system banner
    // prompting the user if they want to grant "Always". We don't block on this.
    await Location.requestBackgroundPermissionsAsync().catch(() => {})

    await activateKeepAwakeAsync(KEEP_AWAKE_TAG)

    subscription.current = await Location.watchPositionAsync(
      {
        accuracy:         Location.Accuracy.BestForNavigation,
        distanceInterval: 5,     // metres — filters GPS jitter
        timeInterval:     1000,  // ms
      },
      (loc) => {
        const { latitude, longitude, accuracy } = loc.coords
        setUserCoord({ latitude, longitude })
        // Discard points with poor accuracy from the recorded route
        if (accuracy !== null && accuracy <= 50) {
          points.current.push({
            latitude,
            longitude,
            timestamp:          loc.timestamp,
            horizontalAccuracy: accuracy ?? 0,
          })
        }
      }
    )

    startDate.current = new Date()
    setIsRecording(true)
    timerRef.current  = setInterval(tick, 1000)
  }, [tick])

  const stopRun = useCallback(async (): Promise<RunRecord | null> => {
    if (!startDate.current) return null

    if (timerRef.current)    clearInterval(timerRef.current)
    subscription.current?.remove()
    deactivateKeepAwake(KEEP_AWAKE_TAG)
    setIsRecording(false)

    const endDate    = new Date()
    const metres     = totalDistanceMetres(points.current)
    const km         = metres / 1000
    const durationSec = Math.floor((endDate.getTime() - startDate.current.getTime()) / 1000)
    const avgPace    = km > 0 ? durationSec / km : 0

    return {
      distanceKm:          km,
      durationSeconds:     durationSec,
      avgPaceSecondsPerKm: avgPace,
      gpsPoints:           points.current,
      startedAt:           startDate.current.toISOString(),
      endedAt:             endDate.toISOString(),
    }
  }, [])

  return { liveState, isRecording, error, startRun, stopRun, userCoord, gpsPoints: points }
}
