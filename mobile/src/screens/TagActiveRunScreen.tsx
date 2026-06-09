import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { TagParameters } from '../types'
import { useRunRecorder } from '../lib/RunRecorder'

interface TagRunState {
  opponentDistanceKm: number
  opponentLat:        number | null
  opponentLng:        number | null
  virtualGapMetres:   number     // positive = thief ahead; negative = police ahead
}

interface Props {
  params:   TagParameters
  onEnd:    (outcome: 'police_win' | 'thief_win') => void
  onCancel: () => void
}

const BROADCAST_INTERVAL_MS = 2_000

// virtual_gap = head_start + thief_distance_km*1000 - police_distance_km*1000
// Police wins at gap ≤ 0. Thief wins at time expiry with gap > 0.
function calcGap(
  headStartMetres: number,
  thiefDistKm: number,
  policeDistKm: number,
): number {
  return headStartMetres + thiefDistKm * 1000 - policeDistKm * 1000
}

export default function TagActiveRunScreen({ params, onEnd, onCancel }: Props) {
  const insets = useSafeAreaInsets()
  const { lobbyCode, myRole, opponentProfile, durationMinutes, headStartMetres } = params

  const [opponent,   setOpponent]   = useState<TagRunState>({
    opponentDistanceKm: 0,
    opponentLat:        null,
    opponentLng:        null,
    virtualGapMetres:   headStartMetres,
  })
  const [elapsed,    setElapsed]    = useState(0)
  const [gameOver,   setGameOver]   = useState(false)
  const mapRef = useRef<MapView>(null)

  // Own GPS
  const { liveState, startRun, stopRun, userCoord } = useRunRecorder()
  const { distanceKm } = liveState
  const myDistRef    = useRef(0)
  myDistRef.current  = distanceKm
  // Keep a ref to userCoord so the broadcast interval never captures a stale closure value
  const userCoordRef = useRef<{ latitude: number; longitude: number } | null>(null)
  userCoordRef.current = userCoord ?? null

  const [outcome, setOutcome] = useState<'police_win' | 'thief_win' | null>(null)

  const broadcastRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef           = useRef<ReturnType<typeof supabase.channel> | null>(null)
  // Ref-based game-over flag prevents stale-closure double-fires in the timer callback
  const gameOverRef          = useRef(false)
  // Only check police win after opponent has sent at least one GPS broadcast
  const opponentBroadcastedRef = useRef(false)

  function endGame(result: 'police_win' | 'thief_win') {
    if (gameOverRef.current) return
    gameOverRef.current = true
    setGameOver(true)
    stopRun()
    setOutcome(result)
  }

  // Start recording on mount
  useEffect(() => { startRun() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Timer
  useEffect(() => {
    const limitSecs = durationMinutes * 60
    const t = setInterval(() => {
      setElapsed(s => {
        const next = s + 1
        if (next >= limitSecs && !gameOverRef.current) endGame('thief_win')
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [durationMinutes, gameOver]) // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase Realtime broadcast for GPS sync
  useEffect(() => {
    const channel = supabase.channel(`tag-${lobbyCode}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'gps' }, ({ payload }) => {
        const { role: senderRole, distanceKm: oppDist, lat, lng } = payload as {
          role: string; distanceKm: number; lat: number | null; lng: number | null
        }
        const opponentRole = myRole === 'police' ? 'thief' : 'police'
        if (senderRole === opponentRole) {
          opponentBroadcastedRef.current = true
          setOpponent(prev => {
            const thiefDist  = myRole === 'thief'   ? myDistRef.current : oppDist
            const policeDist = myRole === 'police'  ? myDistRef.current : oppDist
            const gap = calcGap(headStartMetres, thiefDist, policeDist)
            return {
              opponentDistanceKm: oppDist,
              opponentLat:        lat,
              opponentLng:        lng,
              virtualGapMetres:   gap,
            }
          })
        }
      })
      .subscribe()

    channelRef.current = channel

    // Broadcast own position every 2s — use refs to avoid stale closures
    broadcastRef.current = setInterval(() => {
      channel.send({
        type: 'broadcast',
        event: 'gps',
        payload: {
          role:       myRole,
          distanceKm: myDistRef.current,
          lat:        userCoordRef.current?.latitude ?? null,
          lng:        userCoordRef.current?.longitude ?? null,
        },
      })
    }, BROADCAST_INTERVAL_MS)

    return () => {
      if (broadcastRef.current) clearInterval(broadcastRef.current)
      supabase.removeChannel(channel)
    }
  }, [lobbyCode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Police win check: virtual gap ≤ 0
  useEffect(() => {
    if (gameOverRef.current) return
    // Don't check until the opponent has sent at least one broadcast — prevents instant win
    // before their GPS data arrives (first broadcast takes ~2s after game start)
    if (!opponentBroadcastedRef.current) return
    const myDist   = distanceKm
    const oppDist  = opponent.opponentDistanceKm
    const thiefDist  = myRole === 'thief'  ? myDist : oppDist
    const policeDist = myRole === 'police' ? myDist : oppDist
    const gap = calcGap(headStartMetres, thiefDist, policeDist)

    if (gap <= 0) endGame('police_win')
  }, [distanceKm, opponent.opponentDistanceKm]) // eslint-disable-line react-hooks/exhaustive-deps

  const timeLeft = Math.max(0, durationMinutes * 60 - elapsed)
  const thiefDist  = myRole === 'thief'  ? distanceKm : opponent.opponentDistanceKm
  const policeDist = myRole === 'police' ? distanceKm : opponent.opponentDistanceKm
  const gap = calcGap(headStartMetres, thiefDist, policeDist)

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <View style={s.root}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        followsUserLocation
        mapType="standard"
        userInterfaceStyle="dark"
        initialRegion={{
          latitude:        userCoord?.latitude ?? 37.78825,
          longitude:       userCoord?.longitude ?? -122.4324,
          latitudeDelta:   0.01,
          longitudeDelta:  0.01,
        }}
      >
        {/* Opponent marker */}
        {opponent.opponentLat !== null && opponent.opponentLng !== null && (
          <Marker
            coordinate={{ latitude: opponent.opponentLat, longitude: opponent.opponentLng }}
            title={opponentProfile.username}
          >
            <View style={[s.opponentMarker, { backgroundColor: myRole === 'police' ? C.primary : C.red }]}>
              <Text style={s.opponentMarkerText}>
                {opponentProfile.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Translucent header — VS bar */}
      <View style={[s.header, { paddingTop: insets.top + S.sm }]}>
        <View style={s.headerInner}>
          {/* Police side */}
          <View style={s.vsPlayer}>
            <Avatar username={myRole === 'police' ? 'Me' : opponentProfile.username} size={32} />
            <Text style={s.vsName} numberOfLines={1}>
              {myRole === 'police' ? 'You' : opponentProfile.username}
            </Text>
            <Text style={s.vsRating}>
              {myRole === 'police' ? '' : `(${opponentProfile.tag_rating})`}
            </Text>
          </View>

          {/* P/T bar + timer */}
          <View style={s.vsCenter}>
            <View style={s.ptBarMini}>
              <View style={[s.ptHalfMini, { backgroundColor: C.red }]}>
                <Text style={s.ptLabelMini}>P</Text>
              </View>
              <View style={[s.ptHalfMini, { backgroundColor: C.primary }]}>
                <Text style={s.ptLabelMini}>T</Text>
              </View>
            </View>
            <Text style={s.timer}>{formatTime(timeLeft)}</Text>
          </View>

          {/* Thief side */}
          <View style={[s.vsPlayer, { alignItems: 'flex-end' }]}>
            <Avatar username={myRole === 'thief' ? 'Me' : opponentProfile.username} size={32} />
            <Text style={s.vsName} numberOfLines={1}>
              {myRole === 'thief' ? 'You' : opponentProfile.username}
            </Text>
            <Text style={s.vsRating}>
              {myRole === 'thief' ? '' : `(${opponentProfile.tag_rating})`}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom stats card */}
      <View style={[s.bottomCard, { paddingBottom: insets.bottom + S.sm }]}>
        {/* Gap delta — hero number */}
        <View style={s.gapRow}>
          <Text style={[s.gapLabel, { color: gap > 0 ? C.primary : C.red }]}>
            {gap > 0 ? 'THIEF LEADS' : 'POLICE LEADS'}
          </Text>
          <Text style={[s.gapValue, { color: gap > 0 ? C.primary : C.red }]}>
            {Math.abs(gap) >= 1000
              ? `${(Math.abs(gap) / 1000).toFixed(2)} km`
              : `${Math.abs(Math.round(gap))} m`}
          </Text>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatChip
            icon="walk-outline"
            label="My dist"
            value={`${distanceKm.toFixed(2)} km`}
          />
          <StatChip
            icon="people-outline"
            label="Opp dist"
            value={`${opponent.opponentDistanceKm.toFixed(2)} km`}
          />
          <StatChip
            icon="timer-outline"
            label="Time left"
            value={formatTime(timeLeft)}
          />
        </View>

        {/* End run button — stopRun() clears GPS and timer before navigating away */}
        <TouchableOpacity style={s.endBtn} onPress={() => { stopRun(); onCancel() }} activeOpacity={0.8}>
          <Text style={s.endBtnText}>End Run</Text>
        </TouchableOpacity>
      </View>

      {/* Outcome overlay — shown when game ends */}
      {outcome && (
        <View style={s.outcomeOverlay}>
          <Text style={s.outcomeEmoji}>
            {outcome === 'police_win' ? '🚔' : '🏃'}
          </Text>
          <Text style={s.outcomeTitle}>
            {outcome === 'police_win' ? 'POLICE WINS' : 'THIEF WINS'}
          </Text>
          <Text style={s.outcomeSub}>
            {outcome === 'police_win' ? 'Gap closed — tag!' : 'Time ran out — thief escapes!'}
          </Text>
          <View style={s.outcomeStats}>
            <Text style={s.outcomeStatLine}>
              Your distance: {distanceKm.toFixed(2)} km
            </Text>
            <Text style={s.outcomeStatLine}>
              Opponent: {opponent.opponentDistanceKm.toFixed(2)} km
            </Text>
          </View>
          <TouchableOpacity
            style={s.outcomeDoneBtn}
            onPress={() => onEnd(outcome)}
            activeOpacity={0.85}
          >
            <Text style={s.outcomeDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function StatChip({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={sc.chip}>
      <Ionicons name={icon as any} size={14} color={C.textSub} />
      <Text style={sc.label}>{label}</Text>
      <Text style={sc.value}>{value}</Text>
    </View>
  )
}
const sc = StyleSheet.create({
  chip:  { flex: 1, alignItems: 'center', gap: 2 },
  label: { color: C.textSub, fontSize: 11 },
  value: { color: C.text, fontSize: 13, fontWeight: '600' },
})

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Translucent header
  header:       { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: S.md },
  headerInner:  { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(13,13,13,0.85)', borderRadius: R.xl, paddingHorizontal: S.md, paddingVertical: S.sm, gap: S.sm },
  vsPlayer:     { flex: 1, alignItems: 'flex-start', gap: 2 },
  vsName:       { color: C.text, fontSize: 13, fontWeight: '600', maxWidth: 80 },
  vsRating:     { color: C.textSub, fontSize: 11 },
  vsCenter:     { alignItems: 'center', gap: 4 },

  ptBarMini:    { flexDirection: 'row', height: 18, width: 60, borderRadius: R.full, overflow: 'hidden' },
  ptHalfMini:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ptLabelMini:  { color: C.text, fontSize: 9, fontWeight: '800' },
  timer:        { color: C.text, fontSize: 16, fontFamily: F.display },

  // Opponent marker
  opponentMarker:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: C.text },
  opponentMarkerText: { color: C.text, fontWeight: '700', fontSize: 16 },

  // Bottom card
  bottomCard:   { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(13,13,13,0.92)', borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingHorizontal: S.lg, paddingTop: S.lg },
  gapRow:       { alignItems: 'center', marginBottom: S.sm },
  gapLabel:     { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  gapValue:     { fontSize: 56, fontFamily: F.display, lineHeight: 60 },
  statsRow:     { flexDirection: 'row', gap: S.sm, marginBottom: S.md },
  endBtn:       { backgroundColor: C.card, borderRadius: R.full, paddingVertical: 14, alignItems: 'center', marginTop: S.xs },
  endBtnText:   { color: C.textSub, fontSize: 16, fontWeight: '600' },

  // Outcome overlay
  outcomeOverlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,13,13,0.95)', justifyContent: 'center', alignItems: 'center', padding: S.xl },
  outcomeEmoji:     { fontSize: 72, marginBottom: S.md },
  outcomeTitle:     { fontSize: 36, fontFamily: F.display, color: C.text, marginBottom: S.sm },
  outcomeSub:       { fontSize: 15, color: C.textSub, textAlign: 'center', marginBottom: S.lg },
  outcomeStats:     { backgroundColor: C.card, borderRadius: R.lg, padding: S.md, width: '100%', marginBottom: S.xl, gap: S.xs },
  outcomeStatLine:  { color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  outcomeDoneBtn:   { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 16, paddingHorizontal: 48, alignItems: 'center' },
  outcomeDoneBtnText:{ color: C.bg, fontSize: 18, fontWeight: '700', fontFamily: F.display },
})
