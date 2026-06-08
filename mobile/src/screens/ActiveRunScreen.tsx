import React, { useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, LayoutAnimation, Platform, UIManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps'
import { useRunRecorder } from '../lib/RunRecorder'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { GhostParameters, RunRecord } from '../types'

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface Props {
  ghost?:        GhostParameters
  onBack:        () => void
  onRunComplete: (r: RunRecord) => void
}

function screenBg(delta: number | null, recording: boolean): string {
  if (!recording || delta === null) return C.bg
  if (delta > 100)  return C.bg
  if (delta >= -50) return C.stateOrange
  return C.stateRed
}

function deltaColor(delta: number | null): string {
  if (delta === null) return C.text
  if (delta > 100)  return C.green
  if (delta >= 0)   return C.orange
  return C.red
}

function formatElapsed(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}
function formatPace(s: number): string {
  if (s <= 0 || !isFinite(s)) return '--:--'
  return `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`
}
function pad(n: number): string { return n.toString().padStart(2, '0') }
function fmtDelta(m: number): string {
  const abs = Math.abs(m)
  return abs >= 1000 ? `${(abs / 1000).toFixed(2)} km` : `${Math.round(abs)} m`
}

// Ghost virtual position: interpolate along a straight bearing from
// the first GPS point toward the direction the user is running.
// Uses the first two GPS points to establish a heading, then projects
// the ghost distance along that bearing.
function ghostCoord(
  gpsPoints: React.MutableRefObject<{ latitude: number; longitude: number }[]>,
  ghost: GhostParameters,
  elapsedSeconds: number,
): { latitude: number; longitude: number } | null {
  const pts = gpsPoints.current
  if (pts.length < 1) return null

  const ghostKm = Math.min(
    ghost.challengeDistanceKm,
    (elapsedSeconds / ghost.challengeDurationSeconds) * ghost.challengeDistanceKm,
  )
  const ghostMetres = ghostKm * 1000

  // Project ghost along the bearing from pts[0] toward pts[1] (or due north if only 1 point)
  const origin = pts[0]
  const heading = pts.length >= 2
    ? Math.atan2(
        pts[1].longitude - origin.longitude,
        pts[1].latitude  - origin.latitude,
      )
    : 0  // due north if no heading yet

  const R = 6_371_000
  const dLat = (ghostMetres * Math.cos(heading)) / R
  const dLon = (ghostMetres * Math.sin(heading)) / (R * Math.cos((origin.latitude * Math.PI) / 180))

  return {
    latitude:  origin.latitude  + (dLat * 180) / Math.PI,
    longitude: origin.longitude + (dLon * 180) / Math.PI,
  }
}

export default function ActiveRunScreen({ ghost, onBack, onRunComplete }: Props) {
  const insets = useSafeAreaInsets()
  const { liveState, isRecording, error, startRun, stopRun, userCoord, gpsPoints } = useRunRecorder()
  const { distanceKm, elapsedSeconds, currentPaceSecondsPerKm, ghostDeltaMetres, ghostDeltaSeconds } = liveState
  const mapRef = useRef<MapView>(null)

  const bg = screenBg(ghostDeltaMetres, isRecording)
  const isWarning = isRecording && ghostDeltaMetres !== null && ghostDeltaMetres <= 100

  // P/T progress bar fractions
  const prevGhostFrac = useRef(0)
  const prevMyFrac    = useRef(0)
  const ghostFrac = ghost && elapsedSeconds > 0
    ? Math.min(1, elapsedSeconds / ghost.challengeDurationSeconds)
    : 0
  const myFrac = ghost && ghost.challengeDistanceKm > 0
    ? Math.min(1, distanceKm / ghost.challengeDistanceKm)
    : 0

  // Animate P/T bar on fraction change
  if (ghostFrac !== prevGhostFrac.current || myFrac !== prevMyFrac.current) {
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    })
    prevGhostFrac.current = ghostFrac
    prevMyFrac.current    = myFrac
  }

  const handleStart = useCallback(() => startRun(ghost), [startRun, ghost])
  const handleStop  = useCallback(async () => {
    const rec = await stopRun()
    if (rec) onRunComplete(rec)
  }, [stopRun, onRunComplete])

  // GPS permission denied — show error state (T4)
  if (error && !isRecording) {
    return (
      <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <TouchableOpacity style={s.back} onPress={onBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <View style={s.permDenied}>
          <Ionicons name="location-outline" size={48} color={C.textMuted} />
          <Text style={s.permTitle}>Location Required</Text>
          <Text style={s.permDesc}>{error}</Text>
          <TouchableOpacity style={s.permBtn} onPress={() => {
            import('expo-linking').then(({ openSettings }) => openSettings())
          }}>
            <Text style={s.permBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const ghostPosition = ghost && isRecording
    ? ghostCoord(gpsPoints, ghost, elapsedSeconds)
    : null

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Live GPS map — takes full screen, overlaid by controls */}
      {isRecording && userCoord ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_DEFAULT}
          userInterfaceStyle="dark"
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          region={{
            latitude:       userCoord.latitude,
            longitude:      userCoord.longitude,
            latitudeDelta:  0.004,
            longitudeDelta: 0.004,
          }}
        >
          {/* Route polyline */}
          {gpsPoints.current.length >= 2 && (
            <Polyline
              coordinates={gpsPoints.current}
              strokeColor={C.primary}
              strokeWidth={3}
            />
          )}

          {/* User marker (blue) */}
          <Marker coordinate={userCoord} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.markerUser}>
              <View style={s.markerUserDot} />
            </View>
          </Marker>

          {/* Ghost marker (red) */}
          {ghostPosition && (
            <Marker coordinate={ghostPosition} anchor={{ x: 0.5, y: 1 }}>
              <View style={s.markerGhost}>
                <Ionicons name="person" size={14} color={C.text} />
              </View>
            </Marker>
          )}
        </MapView>
      ) : null}

      {/* Back — always on top */}
      <View style={[s.topOverlay, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.back} onPress={onBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>

        {/* vs header */}
        {ghost ? (
          <View style={s.vsHeader}>
            <View style={s.vsPlayer}>
              <Avatar username={ghost.opponentUsername} size={32} />
              <Text style={s.vsName}>{ghost.opponentUsername}
                <Text style={s.vsGhost}> (ghost)</Text>
              </Text>
            </View>
            <Text style={s.vsWord}>VS</Text>
            <View style={[s.vsPlayer, { justifyContent: 'flex-end' }]}>
              <Text style={s.vsName}>You</Text>
            </View>
          </View>
        ) : (
          <Text style={s.freeRunLabel}>Free Run</Text>
        )}
      </View>

      {/* Hero delta — naked on background, 88px BarlowCondensed */}
      {isRecording && ghost && ghostDeltaMetres !== null && (
        <View style={s.heroWrap}>
          <Text style={[s.heroDelta, { color: deltaColor(ghostDeltaMetres) }]}>
            {ghostDeltaMetres >= 0 ? '+' : '−'}{fmtDelta(ghostDeltaMetres)}
          </Text>
        </View>
      )}

      {/* Bottom stats panel */}
      <View style={[s.bottomPanel, { paddingBottom: insets.bottom + S.sm }]}>
        {/* P/T bar */}
        {ghost && (
          <View style={s.ptBarWrap}>
            <View style={[s.ptHalf, { backgroundColor: C.red, flex: ghostFrac || 0.02 }]}>
              <Text style={s.ptLabel}>P</Text>
            </View>
            <View style={[s.ptHalf, { backgroundColor: C.primary, flex: Math.max(myFrac, 0.02) }]}>
              <Text style={[s.ptLabel, { textAlign: 'right' }]}>T</Text>
            </View>
          </View>
        )}

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statLabel}>Time</Text>
            <Text style={s.statValue}>{formatElapsed(elapsedSeconds)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Distance</Text>
            <Text style={[s.statValue, { color: C.red }]}>{distanceKm.toFixed(2)} km</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Pace</Text>
            <Text style={s.statValue}>{formatPace(currentPaceSecondsPerKm)}</Text>
          </View>
          {ghost && ghostDeltaSeconds !== null && (
            <>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={s.statLabel}>Time gap</Text>
                <Text style={[s.statValue, { color: deltaColor(ghostDeltaMetres) }]}>
                  {ghostDeltaSeconds >= 0 ? '+' : '−'}{Math.abs(Math.round(ghostDeltaSeconds))}s
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Start / Stop */}
        {!isRecording
          ? <TouchableOpacity style={s.startBtn} onPress={handleStart} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Start Run">
              <Text style={s.startBtnText}>Start Run</Text>
            </TouchableOpacity>
          : <TouchableOpacity style={s.stopBtn} onPress={handleStop} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel="Finish Run">
              <Text style={s.startBtnText}>Finish Run</Text>
            </TouchableOpacity>
        }
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:          { flex: 1 },

  // Top overlay (back + vs header)
  topOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  back:          { paddingHorizontal: S.md, paddingVertical: S.sm },

  vsHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingVertical: S.sm, backgroundColor: 'rgba(13,13,13,0.75)' },
  vsPlayer:      { flexDirection: 'row', alignItems: 'center', gap: S.sm, flex: 1 },
  vsName:        { color: C.text, fontSize: 15, fontWeight: '600' },
  vsGhost:       { color: C.textSub, fontWeight: '400' },
  vsWord:        { color: C.text, fontWeight: '800', fontSize: 14 },
  freeRunLabel:  { color: C.textSub, fontSize: 14, paddingHorizontal: S.lg, backgroundColor: 'rgba(13,13,13,0.75)', paddingVertical: S.xs },

  // Hero delta — 88px, naked on background
  heroWrap:      { position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  heroDelta:     { fontFamily: 'BarlowCondensed_900Black', fontSize: 88, letterSpacing: -1, lineHeight: 88 },

  // Map markers
  markerUser:    { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary, borderWidth: 3, borderColor: C.text, justifyContent: 'center', alignItems: 'center' },
  markerUserDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.text },
  markerGhost:   { backgroundColor: C.red, borderRadius: R.sm, padding: 4, borderWidth: 1.5, borderColor: C.text },

  // Bottom stats panel
  bottomPanel:   { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.90)', paddingHorizontal: S.md, paddingTop: S.sm, zIndex: 10 },
  ptBarWrap:     { flexDirection: 'row', height: 28, borderRadius: R.full, overflow: 'hidden', marginBottom: S.sm },
  ptHalf:        { justifyContent: 'center', paddingHorizontal: S.sm },
  ptLabel:       { color: C.text, fontSize: 12, fontWeight: '800' },

  statsRow:      { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: S.sm },
  statItem:      { alignItems: 'center', flex: 1 },
  statLabel:     { color: C.textSub, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  statValue:     { color: C.text, fontSize: 20, fontFamily: 'BarlowCondensed_700Bold' },
  statDivider:   { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: C.border },

  startBtn:      { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  stopBtn:       { backgroundColor: C.red, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  startBtnText:  { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: 'BarlowCondensed_700Bold' },

  // GPS permission denied (T4)
  permDenied:    { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: S.xxl, gap: S.md },
  permTitle:     { color: C.text, fontSize: 22, fontWeight: '700', fontFamily: F.bodyBold },
  permDesc:      { color: C.textSub, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permBtn:       { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 14, paddingHorizontal: S.xxl, marginTop: S.sm },
  permBtnText:   { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
})
