import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, F, R, S } from '../theme'
import type { BountyParameters } from '../types'
import { fmtTime, fmtPace } from '../lib/formatters'

export interface Props {
  params:  BountyParameters
  onBack:  () => void
  onStart: (params: BountyParameters) => void
}

function StatRow({ color, icon, value }: { color: string; icon: string; value: string }) {
  return (
    <View style={sr.row}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={[sr.value, { color }]}>{value}</Text>
    </View>
  )
}
const sr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: S.md },
  value: { flex: 1, textAlign: 'right', fontSize: 26, fontFamily: F.display },
})

export default function BountyPreStartScreen({ params, onBack, onStart }: Props) {
  const insets = useSafeAreaInsets()
  const run    = params.challengerRun
  const date   = new Date(run.created_at)
  const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  // P/T bar: faster run (lower pace) → Police side dominates → harder for Thief to beat
  const REF   = 360  // 6:00/km reference pace in s/km
  const pace  = run.avg_pace_s_per_km > 0 ? run.avg_pace_s_per_km : REF
  const pFlex = Math.max(1, Math.round((REF / pace) * 4))
  const tFlex = Math.max(1, Math.round((pace / REF) * 4))

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Back */}
      <TouchableOpacity style={s.back} onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={28} color={C.text} />
      </TouchableOpacity>

      {/* Mode badge */}
      <View style={s.badgeRow}>
        <View style={s.badge}>
          <Text style={s.badgeText}>BOUNTY</Text>
        </View>
        {!params.isPublic && (
          <View style={[s.badge, { borderColor: C.textMuted }]}>
            <Text style={[s.badgeText, { color: C.textMuted }]}>PRIVATE</Text>
          </View>
        )}
      </View>

      {/* Heading */}
      <Text style={s.heading}>Beat {params.opponentUsername}</Text>
      <View style={s.dateRow}>
        <Text style={s.dateText}>{dateStr}</Text>
        <Text style={s.dateText}>{timeStr}</Text>
      </View>

      {/* Stats card */}
      <View style={s.card}>
        {/* P/T bar — P = posted run difficulty, T = your chance */}
        <View style={s.ptBar}>
          <View style={[s.ptSeg, { flex: pFlex, backgroundColor: C.red }]}>
            <Text style={s.ptLabel}>P</Text>
          </View>
          <View style={[s.ptSeg, { flex: tFlex, backgroundColor: C.primary }]}>
            <Text style={[s.ptLabel, { textAlign: 'right' }]}>T</Text>
          </View>
        </View>

        {/* Time to beat headline */}
        <View style={s.elapsedRow}>
          <Text style={s.elapsedLabel}>Time to Beat</Text>
          <Text style={s.elapsedValue}>{fmtTime(run.duration_s)}</Text>
        </View>

        <View style={s.divider} />

        <StatRow color={C.green}  icon="time-outline"        value={`${fmtTime(run.duration_s)}`} />
        <StatRow color={C.red}    icon="location-outline"    value={`${run.distance_km.toFixed(2)} km`} />
        <StatRow color={C.orange} icon="speedometer-outline" value={fmtPace(run.avg_pace_s_per_km)} />
      </View>

      {/* ELO hint */}
      <Text style={s.eloHint}>Win to earn Bounty ELO · Lose and it costs you</Text>

      {/* Accept */}
      <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
        <TouchableOpacity style={s.acceptBtn} onPress={() => onStart(params)} activeOpacity={0.85}>
          <Text style={s.acceptBtnText}>Accept Challenge</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  back:         { paddingHorizontal: S.md, paddingVertical: S.sm },

  badgeRow:     { flexDirection: 'row', gap: S.sm, paddingHorizontal: S.lg, marginBottom: S.sm },
  badge:        { borderWidth: 1, borderColor: C.primary, borderRadius: R.full, paddingHorizontal: S.sm, paddingVertical: 3 },
  badgeText:    { color: C.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, fontFamily: F.bodyBold },

  heading:      { color: C.text, fontSize: 22, fontWeight: '700', paddingHorizontal: S.lg, fontFamily: F.displayBold },
  dateRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.lg, marginTop: 4, marginBottom: S.lg },
  dateText:     { color: C.textSub, fontSize: 14 },

  card:         { marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.lg, padding: S.md, borderWidth: 1, borderColor: C.border },

  ptBar:        { flexDirection: 'row', height: 28, borderRadius: R.full, overflow: 'hidden', marginBottom: S.md },
  ptSeg:        { justifyContent: 'center', paddingHorizontal: S.sm },
  ptLabel:      { color: C.text, fontSize: 11, fontWeight: '800' },

  elapsedRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: S.xs },
  elapsedLabel: { color: C.text, fontSize: 16, fontWeight: '600' },
  elapsedValue: { color: C.text, fontSize: 28, fontFamily: F.display },

  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: S.sm },

  eloHint:      { color: C.textMuted, fontSize: 12, textAlign: 'center', marginTop: S.lg, paddingHorizontal: S.xl },

  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.lg, paddingTop: S.sm },
  acceptBtn:    { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 18, alignItems: 'center' },
  acceptBtnText:{ color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.bodyBold },
})
