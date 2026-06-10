import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, F, R, S } from '../theme'
import type { GhostParameters, GhostRun } from '../types'
import { fmtTime, fmtPace } from '../lib/formatters'

interface Props {
  run:     GhostRun
  params:  GhostParameters   // passed through to ActiveRunScreen unchanged
  onBack:  () => void
  onStart: (params: GhostParameters) => void
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

export default function GhostPreStartScreen({ run, params, onBack, onStart }: Props) {
  const insets = useSafeAreaInsets()
  const date    = new Date(run.created_at)
  const dateStr = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Back */}
      <TouchableOpacity style={s.back} onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={28} color={C.text} />
      </TouchableOpacity>

      {/* Title + date */}
      <Text style={s.heading}>vs {params.opponentUsername}</Text>
      <View style={s.dateRow}>
        <Text style={s.dateText}>{dateStr}</Text>
        <Text style={s.dateText}>{timeStr}</Text>
      </View>

      {/* Stats card */}
      <View style={s.card}>
        {/* P/T bar — ratio reflects challenge difficulty: fast ghost → P dominates, slow ghost → T favored */}
        {(() => {
          const REF = 360  // 6:00/km reference pace (s/km)
          const pace = run.avg_pace_s_per_km > 0 ? run.avg_pace_s_per_km : REF
          const pFlex = Math.max(1, Math.round((REF / pace) * 4))
          const tFlex = Math.max(1, Math.round((pace / REF) * 4))
          return (
            <View style={s.ptBar}>
              <View style={[s.ptSeg, { flex: pFlex, backgroundColor: C.red }]}>
                <Text style={s.ptLabel}>P</Text>
              </View>
              <View style={[s.ptSeg, { flex: tFlex, backgroundColor: C.primary }]}>
                <Text style={[s.ptLabel, { textAlign: 'right' }]}>T</Text>
              </View>
            </View>
          )
        })()}

        {/* Time elapsed headline */}
        <View style={s.elapsedRow}>
          <Text style={s.elapsedLabel}>Time Elapsed</Text>
          <Text style={s.elapsedValue}>{fmtTime(run.duration_s)}</Text>
        </View>

        <View style={s.divider} />

        {/* Icon metric rows */}
        <StatRow color={C.green}  icon="time-outline"        value={`+ ${fmtTime(run.duration_s)}`} />
        <StatRow color={C.red}    icon="location-outline"    value={`${run.distance_km.toFixed(2)} km away`} />
        <StatRow color={C.orange} icon="speedometer-outline" value={fmtPace(run.avg_pace_s_per_km)} />
      </View>

      {/* Let's go */}
      <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
        <TouchableOpacity style={s.goBtn} onPress={() => onStart(params)} activeOpacity={0.85}>
          <Text style={s.goBtnText}>Let's go</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  back:         { paddingHorizontal: S.md, paddingVertical: S.sm },
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

  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.lg, paddingTop: S.sm },
  goBtn:        { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 18, alignItems: 'center' },
  goBtnText:    { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.bodyBold },
})
