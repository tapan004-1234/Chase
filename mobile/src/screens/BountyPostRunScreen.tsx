import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { evaluateGhostResult } from '../lib/GhostChallenge'
import { C, F, R, S } from '../theme'
import type { BountyParameters, RunRecord } from '../types'
import { fmtPace } from '../lib/formatters'

export interface Props {
  record: RunRecord
  params: BountyParameters
  onDone: () => void
}

type ClaimState = 'idle' | 'claiming' | 'claimed' | 'race_lost' | 'error'

function fmtDuration(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function eloExpected(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400))
}

export default function BountyPostRunScreen({ record, params, onDone }: Props) {
  const insets = useSafeAreaInsets()

  const result = evaluateGhostResult(
    params.challengeDistanceKm,
    params.challengeDurationSeconds,
    record.distanceKm,
    record.durationSeconds,
  )
  const isWin = result === 'win'

  const [claimState, setClaimState] = useState<ClaimState>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [eloDelta,   setEloDelta]   = useState<number | null>(null)
  const [showStats,  setShowStats]  = useState(false)

  const cardBg = isWin ? C.stateBlue : C.stateRed

  const claim = useCallback(async () => {
    setClaimState('claiming')
    setClaimError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setClaimState('error'); setClaimError('Not signed in'); return }

    // ── Step 1: Race guard — attempt to claim the open slot ───────────────
    const { data: claimData } = await supabase
      .from('bounty_challenges')
      .update({ opponent_id: user.id })
      .eq('id', params.bountyId)
      .is('opponent_id', null)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (!claimData) {
      setClaimState('race_lost')
      return
    }

    // ── Step 2: Save run to ghost_runs ────────────────────────────────────
    const { data: runData, error: runErr } = await supabase
      .from('ghost_runs')
      .insert({
        user_id:           user.id,
        distance_km:       record.distanceKm,
        duration_s:        record.durationSeconds,
        avg_pace_s_per_km: record.avgPaceSecondsPerKm,
        gps_points:        record.gpsPoints,
      })
      .select('id')
      .single()

    if (runErr || !runData) {
      setClaimState('error')
      setClaimError(runErr?.message ?? 'Failed to save run')
      return
    }

    // ── Step 3: Complete challenge — guarded by opponent_id = uid ─────────
    const { data: completeData } = await supabase
      .from('bounty_challenges')
      .update({
        opponent_run_id: runData.id,
        winner_id:       isWin ? user.id : params.challengerUserId,
        status:          'complete',
      })
      .eq('id', params.bountyId)
      .eq('opponent_id', user.id)
      .select('id')
      .maybeSingle()

    if (!completeData) {
      setClaimState('error')
      setClaimError('Could not finalize challenge')
      return
    }

    // ── Fetch both ratings for ELO delta display ──────────────────────────
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, bounty_rating')
      .in('id', [user.id, params.challengerUserId])

    if (profiles && profiles.length >= 1) {
      const me    = profiles.find(p => p.id === user.id)
      const them  = profiles.find(p => p.id === params.challengerUserId)
      const myRating    = me?.bounty_rating    ?? 1200
      const theirRating = them?.bounty_rating  ?? 1200
      const expected = eloExpected(myRating, theirRating)
      setEloDelta(Math.round(32 * ((isWin ? 1 : 0) - expected)))
    }

    setClaimState('claimed')
  }, [params, record, isWin])

  useEffect(() => { void claim() }, [claim])

  // ── Full-screen result splash ─────────────────────────────────────────
  if (!showStats) {
    const isClaiming = claimState === 'claiming' || claimState === 'idle'

    return (
      <View style={[s.resultRoot, { backgroundColor: cardBg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="light-content" backgroundColor={cardBg} />

        <View style={s.resultBadgeRow}>
          <View style={s.bountyBadge}>
            <Text style={s.bountyBadgeText}>BOUNTY</Text>
          </View>
          <Text style={s.vsText}>vs {params.opponentUsername}</Text>
        </View>

        <View style={s.resultCenter}>
          {claimState === 'race_lost' ? (
            <>
              <Text style={s.resultTitle}>Too Slow!</Text>
              <Text style={s.resultSub}>Someone else claimed this bounty first</Text>
            </>
          ) : claimState === 'error' ? (
            <>
              <Text style={s.resultTitle}>{isWin ? 'You Won!' : 'Busted!'}</Text>
              <Text style={s.resultSub}>{claimError ?? 'Could not record result'}</Text>
            </>
          ) : (
            <>
              <Text style={s.resultTitle}>{isWin ? 'You Won!' : 'Busted!'}</Text>
              <Text style={s.resultNumber}>{record.distanceKm.toFixed(2)} km</Text>
              {isClaiming
                ? <ActivityIndicator color="rgba(255,255,255,0.6)" style={{ marginTop: S.lg }} />
                : eloDelta !== null
                  ? <Text style={s.eloDelta}>{eloDelta >= 0 ? '+' : ''}{eloDelta} ELO</Text>
                  : null
              }
            </>
          )}
        </View>

        <TouchableOpacity style={s.tapBtn} onPress={() => setShowStats(true)}>
          <Text style={s.tapBtnText}>See Stats →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Stats view ────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.statsRoot}
      contentContainerStyle={[s.statsInner, { paddingTop: insets.top + S.md, paddingBottom: insets.bottom + S.lg }]}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={[s.miniBadge, { backgroundColor: cardBg }]}>
        <Text style={s.miniBadgeText}>
          {isWin ? 'You Won!' : 'Busted!'}
          {eloDelta !== null ? `  ${eloDelta >= 0 ? '+' : ''}${eloDelta} ELO` : ''}
        </Text>
      </View>

      <Text style={s.heading}>Bounty Summary</Text>

      <View style={s.statsCard}>
        <Row label="vs"          value={params.opponentUsername} />
        <Row label="Your dist"   value={`${record.distanceKm.toFixed(2)} km`} />
        <Row label="Your time"   value={fmtDuration(record.durationSeconds)} />
        <Row label="Your pace"   value={fmtPace(record.avgPaceSecondsPerKm)} />
        <View style={s.divider} />
        <Row label="Target dist" value={`${params.challengeDistanceKm.toFixed(2)} km`} />
        <Row label="Target time" value={fmtDuration(params.challengeDurationSeconds)} />
        <Row label="Target pace" value={fmtPace(params.challengerRun.avg_pace_s_per_km)} />
      </View>

      {claimState === 'race_lost' && (
        <Text style={s.raceLostMsg}>
          This bounty was already claimed by another runner before your run finished.
          Your run was not submitted to this challenge.
        </Text>
      )}

      {claimState === 'error' && claimError ? (
        <Text style={s.errorMsg}>{claimError}</Text>
      ) : null}

      <TouchableOpacity style={s.doneBtn} onPress={onDone}>
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
  resultRoot:      { flex: 1, justifyContent: 'space-between' },
  resultBadgeRow:  { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md },
  bountyBadge:     { borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 3 },
  bountyBadgeText: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  vsText:          { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },

  resultCenter:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultTitle:     { color: C.text, fontSize: 56, fontFamily: F.display },
  resultNumber:    { color: C.text, fontSize: 72, fontFamily: F.display, marginTop: S.sm },
  resultSub:       { color: 'rgba(255,255,255,0.75)', fontSize: 16, marginTop: S.md, textAlign: 'center', paddingHorizontal: S.xl },
  eloDelta:        { color: C.text, fontSize: 32, fontFamily: F.display, marginTop: S.lg, fontWeight: '700' },

  tapBtn:          { paddingVertical: S.lg, alignItems: 'center' },
  tapBtnText:      { color: 'rgba(255,255,255,0.7)', fontSize: 16 },

  statsRoot:       { flex: 1, backgroundColor: C.bg },
  statsInner:      { paddingHorizontal: S.lg },
  miniBadge:       { alignSelf: 'flex-start', borderRadius: R.full, paddingHorizontal: S.md, paddingVertical: 6, marginBottom: S.md },
  miniBadgeText:   { color: C.text, fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold },
  heading:         { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: S.lg, fontFamily: F.display },
  statsCard:       { backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, marginBottom: S.lg, borderWidth: 1, borderColor: C.border },
  divider:         { height: 1, backgroundColor: C.border, marginVertical: S.sm },
  raceLostMsg:     { color: C.textSub, fontSize: 14, textAlign: 'center', marginBottom: S.lg, lineHeight: 22, paddingHorizontal: S.sm },
  errorMsg:        { color: C.red, fontSize: 14, textAlign: 'center', marginBottom: S.md },
  doneBtn:         { paddingVertical: 16, alignItems: 'center' },
  doneBtnText:     { color: C.textSub, fontSize: 16 },
})
