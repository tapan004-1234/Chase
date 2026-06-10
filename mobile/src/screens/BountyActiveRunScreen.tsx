import React, { useCallback, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, LayoutAnimation, Platform, UIManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps'
import { useRunRecorder } from '../lib/RunRecorder'
import { DARK_MAP_STYLE } from '../lib/mapStyle'
import { C, F, R, S } from '../theme'
import type { BountyParameters, GhostParameters, RunRecord } from '../types'
import { fmtElapsed, fmtPaceShort } from '../lib/formatters'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export interface Props {
  params:        BountyParameters
  onBack:        () => void
  onRunComplete: (r: RunRecord) => void
}

function screenBg(delta: number | null, recording: boolean): string {
  if (!recording || delta === null) return C.bg
  if (delta > 100) return C.bg
  if (delta >= 0)  return C.stateOrange
  return C.stateRed
}

function deltaColor(delta: number | null): string {
  if (delta === null) return C.text
  if (delta > 100)  return C.you
  if (delta >= 0)   return C.orange
  return C.red
}

function fmtDelta(m: number): string {
  const abs = Math.abs(m)
  return abs >= 1000 ? `${(abs / 1000).toFixed(2)} km` : `${Math.round(abs)} m`
}

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
  const origin = pts[0]
  const heading = pts.length >= 2
    ? Math.atan2(pts[1].longitude - origin.longitude, pts[1].latitude - origin.latitude)
    : 0

  const EARTH_R = 6_371_000
  const dLat = (ghostMetres * Math.cos(heading)) / EARTH_R
  const dLon = (ghostMetres * Math.sin(heading)) / (EARTH_R * Math.cos((origin.latitude * Math.PI) / 180))

  return {
    latitude:  origin.latitude  + (dLat * 180) / Math.PI,
    longitude: origin.longitude + (dLon * 180) / Math.PI,
  }
}

export default function BountyActiveRunScreen({ params, onBack, onRunComplete }: Props) {
  const insets = useSafeAreaInsets()

  // Convert BountyParameters to GhostParameters shape for the run recorder
  const ghostParams: GhostParameters = {
    challengeDistanceKm:      params.challengeDistanceKm,
    challengeDurationSeconds: params.challengeDurationSeconds,
    opponentUsername:         params.opponentUsername,
  }

  const { liveState, isRecording, error, startRun, stopRun, userCoord, gpsPoints } = useRunRecorder()
  const { distanceKm, elapsedSeconds, currentPaceSecondsPerKm, ghostDeltaMetres, ghostDeltaSeconds } = liveState
  const mapRef = useRef<MapView>(null)

  const bg = screenBg(ghostDeltaMetres, isRecording)

  const prevGhostFrac = useRef(0)
  const prevMyFrac    = useRef(0)
  const ghostFrac = elapsedSeconds > 0 ? Math.min(1, elapsedSeconds / ghostParams.challengeDurationSeconds) : 0
  const myFrac    = ghostParams.challengeDistanceKm > 0 ? Math.min(1, distanceKm / ghostParams.challengeDistanceKm) : 0

  if (ghostFrac !== prevGhostFrac.current || myFrac !== prevMyFrac.current) {
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    })
    prevGhostFrac.current = ghostFrac
    prevMyFrac.current    = myFrac
  }

  useEffect(() => () => { void stopRun() }, [stopRun])

  useEffect(() => {
    if (userCoord && mapRef.current && isRecording) {
      mapRef.current.animateCamera(
        { center: { latitude: userCoord.latitude, longitude: userCoord.longitude }, zoom: 17 },
        { duration: 800 },
      )
    }
  }, [userCoord, isRecording])

  const handleStart = useCallback(() => startRun(ghostParams), [startRun, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const handleStop  = useCallback(async () => {
    const rec = await stopRun()
    if (rec) onRunComplete(rec)
  }, [stopRun, onRunComplete])

  if (error && !isRecording) {
    return (
      <View style={[s.root, { backgroundColor: C.bg, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
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

  const ghostPosition = isRecording ? ghostCoord(gpsPoints, ghostParams, elapsedSeconds) : null

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />

      {isRecording && userCoord ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={PROVIDER_DEFAULT}
          userInterfaceStyle="dark"
          customMapStyle={DARK_MAP_STYLE}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          initialRegion={{
            latitude:       userCoord.latitude,
            longitude:      userCoord.longitude,
            latitudeDelta:  0.004,
            longitudeDelta: 0.004,
          }}
        >
          {gpsPoints.current.length >= 2 && (
            <Polyline coordinates={gpsPoints.current} strokeColor={C.you} strokeWidth={3} />
          )}
          <Marker coordinate={userCoord} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={s.markerUser}>
              <View style={s.markerUserDot} />
            </View>
          </Marker>
          {ghostPosition && (
            <Marker coordinate={ghostPosition} anchor={{ x: 0.5, y: 1 }}>
              <View style={s.markerGhost}>
                <Ionicons name="person" size={14} color={C.text} />
              </View>
            </Marker>
          )}
        </MapView>
      ) : null}

      <View style={[s.topOverlay, { paddingTop: insets.top }]}>
        <TouchableOpacity style={s.back} onPress={onBack}>
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <View style={s.vsHeader}>
          <View style={s.vsLeft}>
            <View style={s.bountyChip}>
              <Text style={s.bountyChipText}>BOUNTY</Text>
            </View>
            <Text style={s.vsName} numberOfLines={1}>{params.opponentUsername}</Text>
          </View>
          <Text style={s.vsWord}>VS</Text>
          <View style={[s.vsLeft, { justifyContent: 'flex-end' }]}>
            <Text style={s.vsName}>You</Text>
          </View>
        </View>
      </View>

      {isRecording && ghostDeltaMetres !== null && (
        <View style={s.heroWrap}>
          <Text style={[s.heroDelta, { color: deltaColor(ghostDeltaMetres) }]}>
            {ghostDeltaMetres >= 0 ? '+' : '−'}{fmtDelta(ghostDeltaMetres)}
          </Text>
        </View>
      )}

      <View style={[s.bottomPanel, { paddingBottom: insets.bottom + S.sm }]}>
        <View style={s.ptBarWrap}>
          <View style={[s.ptHalf, { backgroundColor: C.red, flex: ghostFrac || 0.02 }]}>
            <Text style={s.ptLabel}>P</Text>
          </View>
          <View style={[s.ptHalf, { backgroundColor: C.primary, flex: Math.max(myFrac, 0.02) }]}>
            <Text style={[s.ptLabel, { textAlign: 'right' }]}>T</Text>
          </View>
        </View>

        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statLabel}>Time</Text>
            <Text style={s.statValue}>{fmtElapsed(elapsedSeconds)}</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Distance</Text>
            <Text style={[s.statValue, { color: C.red }]}>{distanceKm.toFixed(2)} km</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statLabel}>Pace</Text>
            <Text style={s.statValue}>{fmtPaceShort(currentPaceSecondsPerKm)}</Text>
          </View>
          {ghostDeltaSeconds !== null && (
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
  root:           { flex: 1 },

  topOverlay:     { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  back:           { paddingHorizontal: S.md, paddingVertical: S.sm },

  vsHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingVertical: S.sm, backgroundColor: 'rgba(13,13,13,0.75)' },
  vsLeft:         { flexDirection: 'row', alignItems: 'center', gap: S.xs, flex: 1 },
  vsName:         { color: C.text, fontSize: 15, fontWeight: '600' },
  vsWord:         { color: C.text, fontWeight: '800', fontSize: 14 },
  bountyChip:     { backgroundColor: 'rgba(61,123,255,0.20)', borderRadius: R.full, paddingHorizontal: 6, paddingVertical: 2 },
  bountyChipText: { color: C.primary, fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  heroWrap:       { position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center', zIndex: 5 },
  heroDelta:      { fontFamily: 'BarlowCondensed_900Black', fontSize: 88, letterSpacing: -1, lineHeight: 88 },

  markerUser:     { width: 22, height: 22, borderRadius: 11, backgroundColor: C.you, borderWidth: 3, borderColor: C.text, justifyContent: 'center', alignItems: 'center' },
  markerUserDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: C.text },
  markerGhost:    { backgroundColor: C.red, borderRadius: R.sm, padding: 4, borderWidth: 1.5, borderColor: C.text },

  bottomPanel:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.90)', paddingHorizontal: S.md, paddingTop: S.sm, zIndex: 10 },
  ptBarWrap:      { flexDirection: 'row', height: 28, borderRadius: R.full, overflow: 'hidden', marginBottom: S.sm },
  ptHalf:         { justifyContent: 'center', paddingHorizontal: S.sm },
  ptLabel:        { color: C.text, fontSize: 12, fontWeight: '800' },

  statsRow:       { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: S.sm },
  statItem:       { alignItems: 'center', flex: 1 },
  statLabel:      { color: C.textSub, fontSize: 11, fontWeight: '600', marginBottom: 2 },
  statValue:      { color: C.text, fontSize: 20, fontFamily: 'BarlowCondensed_700Bold' },
  statDivider:    { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: C.border },

  startBtn:       { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  stopBtn:        { backgroundColor: C.red, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  startBtnText:   { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: 'BarlowCondensed_700Bold' },

  permDenied:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: S.xxl, gap: S.md },
  permTitle:      { color: C.text, fontSize: 22, fontWeight: '700', fontFamily: F.bodyBold },
  permDesc:       { color: C.textSub, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permBtn:        { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 14, paddingHorizontal: S.xxl, marginTop: S.sm },
  permBtnText:    { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
})
