import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { VictoryArea, VictoryChart, VictoryAxis } from 'victory-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { Profile } from '../types'

interface Props { profile: Profile }

type Period  = '7d' | '30d' | '90d' | '1y' | 'All'
type StatTab = 'Tag' | 'Ghost'

const PERIODS: { label: string; value: Period }[] = [
  { label: '7 days',   value: '7d'  },
  { label: '30 days',  value: '30d' },
  { label: '90 days',  value: '90d' },
  { label: '1 year',   value: '1y'  },
  { label: 'All Time', value: 'All' },
]

function periodDays(p: Period): number | null {
  return p === '7d' ? 7 : p === '30d' ? 30 : p === '90d' ? 90 : p === '1y' ? 365 : null
}

interface Stats {
  ghostsPlayed: number
  totalKm:      number
  currentRating: number
  ratingHistory: { rating: number; created_at: string }[]
}

export default function StatsScreen({ profile }: Props) {
  const insets  = useSafeAreaInsets()
  const [period,  setPeriod]  = useState<Period>('90d')
  const [statTab, setStatTab] = useState<StatTab>('Ghost')
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const days = periodDays(period)
    const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null

    // Ghost challenges played
    let q = supabase.from('ghost_challenges')
      .select('*', { count: 'exact', head: true })
      .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      .eq('status', 'completed')
    if (since) q = q.gte('created_at', since)
    const { count: ghostCount } = await q

    // Total km
    let rq = supabase.from('ghost_runs').select('distance_km').eq('user_id', profile.id)
    if (since) rq = rq.gte('created_at', since)
    const { data: runs } = await rq
    const totalKm = (runs ?? []).reduce((s, r) => s + r.distance_km, 0)

    // Rating history
    let hq = supabase.from('ratings_history')
      .select('new_rating, created_at')
      .eq('user_id', profile.id).eq('mode', 'ghost')
      .order('created_at', { ascending: true })
    if (since) hq = hq.gte('created_at', since)
    const { data: hist } = await hq

    setStats({
      ghostsPlayed:  ghostCount ?? 0,
      totalKm,
      currentRating: profile.ghost_rating,
      ratingHistory: (hist ?? []).map(h => ({ rating: h.new_rating, created_at: h.created_at })),
    })
    setLoading(false)
  }, [profile.id, profile.ghost_rating, period])

  useEffect(() => { load() }, [load])

  function RatingChart({ data }: { data: number[] }) {
    if (data.length < 2) {
      return <View style={spark.empty}><Text style={spark.emptyText}>No history yet</Text></View>
    }
    const chartData = data.map((y, x) => ({ x, y }))
    const minY = Math.min(...data) - 30
    const maxY = Math.max(...data) + 30
    return (
      <VictoryChart
        height={100}
        padding={{ top: 8, bottom: 24, left: 0, right: 0 }}
        domain={{ y: [minY, maxY] }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: C.border },
            ticks: { stroke: 'transparent' },
            tickLabels: { fill: C.textMuted, fontSize: 9, fontFamily: F.body },
          }}
          tickCount={3}
          tickFormat={(t: number) => {
            const idx = Math.round(t)
            if (idx < 0 || idx >= data.length) return ''
            const d = new Date(stats!.ratingHistory[idx]?.created_at ?? '')
            return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`
          }}
        />
        <VictoryArea
          data={chartData}
          style={{
            data: {
              fill: `${C.primary}22`,
              stroke: C.primary,
              strokeWidth: 2,
            },
          }}
          interpolation="natural"
        />
      </VictoryChart>
    )
  }

  const kmStr = stats ? (stats.totalKm >= 1 ? `${stats.totalKm.toFixed(0)} Km` : `${(stats.totalKm * 1000).toFixed(0)} m`) : '--'

  return (
    <ScrollView style={[s.root, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.topRow}>
        <TouchableOpacity style={s.compareBtn}
          onPress={() => Alert.alert('Coming soon', 'Compare mode is coming in the next update.')}>
          <Ionicons name="copy-outline" size={16} color={C.text} />
          <Text style={s.compareBtnText}>Compare</Text>
        </TouchableOpacity>
      </View>

      {/* Profile mini */}
      <View style={s.miniProfile}>
        <Avatar username={profile.username} size={40} radius={10} />
        <View style={{ marginLeft: S.sm }}>
          <Text style={s.miniName}>{profile.username}</Text>
        </View>
      </View>

      {/* Period filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.periodScroll} contentContainerStyle={s.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity key={p.value} style={[s.periodBtn, period === p.value && s.periodBtnActive]}
            onPress={() => setPeriod(p.value)}>
            <Text style={[s.periodText, period === p.value && s.periodTextActive]}>{p.label}</Text>
            {period === p.value && <View style={s.periodUnderline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={C.text} style={{ marginTop: S.xxl }} />
      ) : stats ? (
        <>
          {/* Stat tiles */}
          <View style={s.tilesRow}>
            <View style={s.tile}>
              <Ionicons name="body-outline" size={28} color={C.red} />
              <Text style={s.tileNum}>{0}</Text>
              <Text style={s.tileLabel}>Tags</Text>
            </View>
            <View style={s.tile}>
              <Ionicons name="timer-outline" size={28} color={C.primary} />
              <Text style={s.tileNum}>{stats.ghostsPlayed}</Text>
              <Text style={s.tileLabel}>Ghosts</Text>
            </View>
          </View>

          {/* History tab toggle */}
          <View style={s.statTabs}>
            {(['Tag', 'Ghost'] as StatTab[]).map(t => (
              <TouchableOpacity key={t} style={[s.statTab, statTab === t && s.statTabActive]}
                onPress={() => setStatTab(t)}>
                <Text style={[s.statTabText, statTab === t && s.statTabTextActive]}>{t} History</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart */}
          <View style={s.chartCard}>
            <View style={s.chartYAxis}>
              {[stats.currentRating + 100, stats.currentRating, stats.currentRating - 100].map(v => (
                <Text key={v} style={s.chartYLabel}>{v}</Text>
              ))}
            </View>
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <RatingChart data={stats.ratingHistory.map(h => h.rating)} />
            </View>
          </View>

          {/* Km total */}
          <View style={s.kmRow}>
            <Text style={s.kmValue}>{kmStr}</Text>
            <View style={s.kmComparison}>
              <View style={[s.dot, { backgroundColor: C.primary }]} />
              <Text style={s.kmPeriodLabel}>{PERIODS.find(p => p.value === period)?.label}</Text>
            </View>
          </View>
        </>
      ) : null}

      <View style={{ height: insets.bottom + S.xl }} />
    </ScrollView>
  )
}

const spark = StyleSheet.create({
  empty:     { flex: 1, justifyContent: 'center', alignItems: 'center', height: 80 },
  emptyText: { color: C.textMuted, fontSize: 13 },
})

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  topRow:           { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: S.sm },
  compareBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 14, gap: S.xs },
  compareBtnText:   { color: C.text, fontSize: 13, fontWeight: '600' },

  miniProfile:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.md },
  miniName:         { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },

  // Period filter
  periodScroll:     { marginBottom: S.md },
  periodRow:        { paddingHorizontal: S.lg, gap: S.lg },
  periodBtn:        { paddingVertical: 14 },
  periodBtnActive:  {},
  periodText:       { color: C.textSub, fontSize: 14 },
  periodTextActive: { color: C.text, fontWeight: '700', fontFamily: F.bodyBold },
  periodUnderline:  { height: 2, backgroundColor: C.text, borderRadius: 1, marginTop: 4 },

  // Tiles
  tilesRow:         { flexDirection: 'row', paddingHorizontal: S.lg, gap: S.md, marginBottom: S.lg },
  tile:             { flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, alignItems: 'center', gap: S.xs },
  tileNum:          { color: C.text, fontSize: 40, fontFamily: F.display },
  tileLabel:        { color: C.textSub, fontSize: 13 },

  // Stat history tabs
  statTabs:         { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.md, gap: S.sm },
  statTab:          { paddingVertical: 14, paddingHorizontal: S.md, borderRadius: R.md },
  statTabActive:    { backgroundColor: C.card },
  statTabText:      { color: C.textMuted, fontSize: 15, fontWeight: '600' },
  statTabTextActive:{ color: C.text },

  // Chart
  chartCard:        { flexDirection: 'row', backgroundColor: C.card, marginHorizontal: S.lg, borderRadius: R.lg, padding: S.md, marginBottom: S.md, height: 120, alignItems: 'flex-end' },
  chartYAxis:       { justifyContent: 'space-between', height: 80, marginRight: S.sm },
  chartYLabel:      { color: C.textMuted, fontSize: 10 },

  // Km
  kmRow:            { paddingHorizontal: S.lg, marginBottom: S.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kmValue:          { color: C.text, fontSize: 48, fontFamily: F.display },
  kmComparison:     { flexDirection: 'row', alignItems: 'center', gap: S.xs, marginBottom: S.sm },
  dot:              { width: 8, height: 8, borderRadius: 4 },
  kmPeriodLabel:    { color: C.textSub, fontSize: 13 },
})
