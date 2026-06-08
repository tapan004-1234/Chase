import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { evaluateGhostResult } from '../lib/GhostChallenge'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { GhostParameters, Profile, RunRecord } from '../types'

interface Props {
  record:             RunRecord
  ghost?:             GhostParameters
  alreadySavedRunId?: string   // set when navigating from past-runs list
  onDone:             () => void
}

interface Friend { profile: Profile }

function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
function fmtPace(s: number) {
  if (s <= 0 || !isFinite(s)) return '--:--'
  return `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))} /km`
}
function fmtDelta(m: number) {
  return Math.abs(m) >= 1000
    ? `${(Math.abs(m) / 1000).toFixed(2)} km`
    : `${Math.round(Math.abs(m))} m`
}

// Metres ahead/behind ghost when we hit challenge distance
function resultDelta(ghost: GhostParameters, run: RunRecord): number {
  const ghostPace = ghost.challengeDistanceKm > 0
    ? ghost.challengeDurationSeconds / ghost.challengeDistanceKm : 0
  if (ghostPace <= 0) return 0
  const ghostKm = run.durationSeconds / ghostPace
  return (ghost.challengeDistanceKm - ghostKm) * 1000
}

export default function PostRunScreen({ record, ghost, alreadySavedRunId, onDone }: Props) {
  const insets   = useSafeAreaInsets()
  const [result,    setResult]    = useState<'win' | 'loss' | null>(null)
  const [delta,     setDelta]     = useState(0)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(!!alreadySavedRunId)
  const [savedRunId, setSavedRunId] = useState<string | null>(alreadySavedRunId ?? null)
  const [error,     setError]     = useState<string | null>(null)
  // Skip the full-screen result splash when arriving from past runs (run already saved)
  const [showStats, setShowStats] = useState(!!alreadySavedRunId)
  // Post-save challenge flow (free runs only)
  const [friends,   setFriends]   = useState<Friend[]>([])
  const [challenging, setChallenging] = useState<string | null>(null) // friend.profile.id
  const [challenged,  setChallenged]  = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!ghost) return
    const r = evaluateGhostResult(
      ghost.challengeDistanceKm, ghost.challengeDurationSeconds,
      record.distanceKm, record.durationSeconds,
    )
    setResult(r)
    setDelta(resultDelta(ghost, record))
  }, [ghost, record])

  // Load friends list once a free run is saved (so user can immediately challenge)
  useEffect(() => {
    if (!saved || ghost) return
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('friend_requests')
        .select('from_profile:profiles!from_id(*), to_profile:profiles!to_id(*)')
        .or(`from_id.eq.${user.id},to_id.eq.${user.id}`)
        .eq('status', 'accepted')
      const list: Friend[] = ((data ?? []) as any[]).map(req => ({
        profile: req.from_profile.id === user.id ? req.to_profile : req.from_profile,
      }))
      setFriends(list)
    })()
  }, [saved, ghost])

  async function save() {
    setSaving(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in'); setSaving(false); return }

    const { data: runData, error: e1 } = await supabase
      .from('ghost_runs')
      .insert({
        user_id:           user.id,
        distance_km:       record.distanceKm,
        duration_s:        record.durationSeconds,
        avg_pace_s_per_km: record.avgPaceSecondsPerKm,
        gps_points:        record.gpsPoints,
      }).select().single()
    if (e1 || !runData) { setError(e1?.message ?? 'Save failed'); setSaving(false); return }

    setSavedRunId(runData.id)

    if (ghost && result) {
      const { error: e2 } = await supabase
        .from('ghost_challenges')
        .update({
          opponent_run_id: runData.id,
          winner_id: result === 'win' ? user.id : ghost.challengerUserId,
          status: 'completed',
        })
        .eq('id', ghost.challengeId)
        .eq('opponent_id', user.id)
      if (e2) { setError(e2.message); setSaving(false); return }
    }

    setSaved(true); setSaving(false)
  }

  async function challengeFriend(friend: Profile) {
    if (!savedRunId) return
    setChallenging(friend.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setChallenging(null); return }
    const expires = new Date(Date.now() + 7 * 86400_000).toISOString()
    const { error } = await supabase.from('ghost_challenges').insert({
      challenger_id:     user.id,
      opponent_id:       friend.id,
      challenger_run_id: savedRunId,
      expires_at:        expires,
    })
    setChallenging(null)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setChallenged(prev => new Set(prev).add(friend.id))
    }
  }

  // ── Full-screen result card ────────────────────────────────────────────
  const isWin    = result === 'win'
  const cardBg   = ghost ? (isWin ? C.stateBlue : C.stateRed) : C.card
  const resultLabel = ghost ? (isWin ? 'Escape' : 'Busted!') : 'Run Complete'
  const deltaLabel  = ghost
    ? (isWin ? `+${fmtDelta(delta)}` : `${Math.round(Math.abs(delta))}`)
    : record.distanceKm.toFixed(2) + ' km'

  if (!showStats && ghost) {
    return (
      <View style={[s.resultRoot, { backgroundColor: cardBg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" />
        <View style={s.resultCenter}>
          <Text style={s.resultTitle}>{resultLabel}</Text>
          <Text style={s.resultNumber}>{deltaLabel}</Text>
        </View>
        <TouchableOpacity style={s.tapBtn} onPress={() => setShowStats(true)}>
          <Text style={s.tapBtnText}>See Stats →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Stats view ─────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.statsRoot}
      contentContainerStyle={[s.statsInner, { paddingTop: insets.top + S.md, paddingBottom: insets.bottom + S.lg }]}
    >
      <StatusBar barStyle="light-content" />

      {ghost && (
        <View style={[s.miniBadge, { backgroundColor: cardBg }]}>
          <Text style={s.miniBadgeText}>{resultLabel} {deltaLabel}</Text>
        </View>
      )}

      <Text style={s.heading}>Run Summary</Text>

      <View style={s.statsCard}>
        <Row label="Distance" value={`${record.distanceKm.toFixed(2)} km`} />
        <Row label="Duration" value={fmtDuration(record.durationSeconds)} />
        <Row label="Avg pace" value={fmtPace(record.avgPaceSecondsPerKm)} />
        {ghost && (
          <>
            <View style={s.divider} />
            <Row label="Challenge dist" value={`${ghost.challengeDistanceKm.toFixed(2)} km`} />
            <Row label="Challenge time" value={fmtDuration(ghost.challengeDurationSeconds)} />
            <Row label="vs" value={ghost.opponentUsername} />
          </>
        )}
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      {!saved
        ? (
          <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color={C.text} />
              : <Text style={s.saveBtnText}>Save Run</Text>}
          </TouchableOpacity>
        ) : (
          <View style={[s.saveBtn, s.savedBtn]}>
            <Text style={[s.saveBtnText, { color: C.green }]}>Saved ✓</Text>
          </View>
        )
      }

      {/* Challenge friends — only shown after saving a free run (not a ghost challenge) */}
      {saved && !ghost && friends.length > 0 && (
        <View style={s.challengeSection}>
          <Text style={s.challengeSectionTitle}>CHALLENGE FRIENDS</Text>
          <Text style={s.challengeSectionSub}>Dare someone to beat this run</Text>
          {friends.map(f => (
            <View key={f.profile.id} style={s.friendRow}>
              <Avatar username={f.profile.username} size={40} />
              <View style={s.friendInfo}>
                <Text style={s.friendName}>{f.profile.username}</Text>
                <Text style={s.friendRating}>Ghost {f.profile.ghost_rating}</Text>
              </View>
              {challenged.has(f.profile.id) ? (
                <View style={[s.challengeBtn, s.challengedBtn]}>
                  <Text style={[s.challengeBtnText, { color: C.green }]}>Sent ✓</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.challengeBtn}
                  onPress={() => challengeFriend(f.profile)}
                  disabled={challenging === f.profile.id}
                >
                  {challenging === f.profile.id
                    ? <ActivityIndicator color={C.text} size="small" />
                    : <Text style={s.challengeBtnText}>Challenge</Text>
                  }
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {saved && !ghost && friends.length === 0 && (
        <View style={s.noFriendsHint}>
          <Text style={s.noFriendsText}>Add friends from the Profile tab to challenge them with this run.</Text>
        </View>
      )}

      <TouchableOpacity style={s.doneBtn} onPress={() => {
        if (!saved) {
          Alert.alert(
            'Unsaved Run',
            'Your run hasn\'t been saved yet. Leave without saving?',
            [
              { text: 'Save first', style: 'cancel', onPress: save },
              { text: 'Leave', style: 'destructive', onPress: onDone },
            ],
          )
        } else {
          onDone()
        }
      }}>
        <Text style={s.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      <Text style={r.value}>{value}</Text>
    </View>
  )
}
const r = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  label: { color: C.textSub, fontSize: 15 },
  value: { color: C.text, fontSize: 15, fontWeight: '600' },
})

const s = StyleSheet.create({
  resultRoot:   { flex: 1, justifyContent: 'space-between' },
  resultCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultTitle:  { color: C.text, fontSize: 56, fontFamily: F.display },
  resultNumber: { color: C.text, fontSize: 80, fontFamily: F.display, marginTop: S.md },
  tapBtn:       { paddingVertical: S.lg, alignItems: 'center' },
  tapBtnText:   { color: 'rgba(255,255,255,0.7)', fontSize: 16 },

  statsRoot:    { flex: 1, backgroundColor: C.bg },
  statsInner:   { paddingHorizontal: S.lg },
  miniBadge:    { alignSelf: 'flex-start', borderRadius: R.full, paddingHorizontal: S.md, paddingVertical: 6, marginBottom: S.md },
  miniBadgeText:{ color: C.text, fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold },
  heading:      { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: S.lg, fontFamily: F.bodyBold },
  statsCard:    { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.lg },
  divider:      { height: 1, backgroundColor: C.border, marginVertical: S.sm },
  error:        { color: C.red, textAlign: 'center', marginBottom: S.md },

  saveBtn:      { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  savedBtn:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.green },
  saveBtnText:  { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },

  // Post-save challenge section
  challengeSection:      { marginTop: S.lg, marginBottom: S.sm },
  challengeSectionTitle: { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  challengeSectionSub:   { color: C.textMuted, fontSize: 13, marginBottom: S.md },
  friendRow:             { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: S.sm },
  friendInfo:            { flex: 1 },
  friendName:            { color: C.text, fontSize: 15, fontWeight: '600' },
  friendRating:          { color: C.textSub, fontSize: 12, marginTop: 2 },
  challengeBtn:          { backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 11 },
  challengedBtn:         { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.green },
  challengeBtnText:      { color: C.text, fontWeight: '700', fontSize: 13 },
  noFriendsHint:         { marginTop: S.lg, padding: S.lg, backgroundColor: C.card, borderRadius: R.lg },
  noFriendsText:         { color: C.textSub, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  doneBtn:      { paddingVertical: 16, alignItems: 'center' },
  doneBtnText:  { color: C.textSub, fontSize: 16 },
})
