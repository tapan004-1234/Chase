import React, { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { evaluateGhostResult } from '../lib/GhostChallenge'
import { C, F, R, S } from '../theme'
import type { GhostParameters, RunRecord } from '../types'
import { fmtPace } from '../lib/formatters'

interface Props {
  record:             RunRecord
  ghost?:             GhostParameters
  bountyId?:          string
  alreadySavedRunId?: string   // set when navigating from past-runs list
  onDone:             () => void
}

function pad(n: number) { return n.toString().padStart(2, '0') }
function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return m > 0 ? `${m}m ${s}s` : `${s}s`
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

export default function PostRunScreen({ record, ghost, bountyId, alreadySavedRunId, onDone }: Props) {
  const insets   = useSafeAreaInsets()
  const [result,    setResult]    = useState<'win' | 'loss' | null>(null)
  const [delta,     setDelta]     = useState(0)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(!!alreadySavedRunId)
  const [savedRunId, setSavedRunId] = useState<string | null>(alreadySavedRunId ?? null)
  const [error,          setError]          = useState<string | null>(null)
  // Skip the full-screen result splash when arriving from past runs (run already saved)
  const [showStats,      setShowStats]      = useState(!!alreadySavedRunId)
  const [bountyPosted,   setBountyPosted]   = useState(false)
  const [bountyPosting,  setBountyPosting]  = useState(false)
  const [bountyPostError, setBountyPostError] = useState<string | null>(null)

  useEffect(() => {
    if (!ghost) return
    const r = evaluateGhostResult(
      ghost.challengeDistanceKm, ghost.challengeDurationSeconds,
      record.distanceKm, record.durationSeconds,
    )
    setResult(r)
    setDelta(resultDelta(ghost, record))
  }, [ghost, record])

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
    setSaved(true); setSaving(false)
  }

  async function postAsBounty() {
    if (!savedRunId) return
    setBountyPosting(true); setBountyPostError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBountyPosting(false); return }
    const expires = new Date(Date.now() + 7 * 86400_000).toISOString()
    const { error } = await supabase.from('bounty_challenges').insert({
      challenger_id:     user.id,
      challenger_run_id: savedRunId,
      is_public:         true,
      opponent_id:       null,
      expires_at:        expires,
      status:            'pending',
    })
    setBountyPosting(false)
    if (error) setBountyPostError(error.message)
    else setBountyPosted(true)
  }

  // ── Full-screen result card ────────────────────────────────────────────
  const isWin    = result === 'win'
  const cardBg   = ghost ? (isWin ? C.stateBlue : C.stateRed) : C.card
  const resultLabel = ghost ? (isWin ? 'Escape' : 'Busted!') : 'Run Complete'
  const deltaLabel  = ghost
    ? (isWin ? `+${fmtDelta(delta)}` : `-${fmtDelta(delta)}`)
    : record.distanceKm.toFixed(2) + ' km'

  if (!showStats && ghost) {
    return (
      <View style={[s.resultRoot, { backgroundColor: cardBg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" backgroundColor={cardBg} />
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
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

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

      {/* Post as Bounty — shown after saving any Ghost/free run (not a bounty-accept run) */}
      {saved && !bountyId && savedRunId && (
        <View style={s.bountySection}>
          {bountyPosted ? (
            <View style={[s.saveBtn, s.savedBtn]}>
              <Text style={[s.saveBtnText, { color: C.green }]}>Posted to Bounty Board ✓</Text>
            </View>
          ) : (
            <>
              {bountyPostError ? <Text style={s.error}>{bountyPostError}</Text> : null}
              <TouchableOpacity style={s.bountyBtn} onPress={postAsBounty} disabled={bountyPosting}>
                {bountyPosting
                  ? <ActivityIndicator color={C.text} />
                  : (
                    <>
                      <Text style={s.bountyBtnText}>Post as Bounty</Text>
                      <Text style={s.bountyBtnSub}>Let anyone try to beat this run</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </>
          )}
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
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: S.rowVert },
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
  miniBadge:    { alignSelf: 'flex-start', borderRadius: R.full, paddingHorizontal: S.md, paddingVertical: S.sm, marginBottom: S.md },
  miniBadgeText:{ color: C.text, fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold },
  heading:      { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: S.lg, fontFamily: F.display },
  statsCard:    { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.lg, borderWidth: 1, borderColor: C.border },
  divider:      { height: 1, backgroundColor: C.border, marginVertical: S.sm },
  error:        { color: C.red, textAlign: 'center', marginBottom: S.md },

  saveBtn:      { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', marginBottom: S.sm },
  savedBtn:     { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: C.green },
  saveBtnText:  { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },

  // Post as Bounty section
  bountySection:  { marginTop: S.sm, marginBottom: S.sm },
  bountyBtn:      { backgroundColor: C.card, borderRadius: R.full, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: C.primary },
  bountyBtnText:  { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
  bountyBtnSub:   { color: C.textSub, fontSize: 12, marginTop: 2 },

  doneBtn:      { paddingVertical: 16, alignItems: 'center' },
  doneBtnText:  { color: C.textSub, fontSize: 16 },
})
