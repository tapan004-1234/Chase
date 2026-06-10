import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, StatusBar,
} from 'react-native'
import { VictoryArea, VictoryChart, VictoryAxis } from 'victory-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { computeGhostScore } from '../lib/ghostScore'
import { C, F, R, S } from '../theme'
import type { GhostRun, Profile } from '../types'
import { fmtPace } from '../lib/formatters'

interface Props {
  profile:    Profile
  ghostScore: number
}

type Period  = '7d' | '30d' | '90d' | '1y' | 'All'
type StatTab = 'Tag' | 'Bounty' | 'Ghost'

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
  tagsPlayed:     number
  bountiesPlayed: number
  totalKm:        number
  tagHistory:     { rating: number; created_at: string }[]
  bountyHistory:  { rating: number; created_at: string }[]
  ghostRuns:      GhostRun[]
}

export default function StatsScreen({ profile, ghostScore }: Props) {
  const insets  = useSafeAreaInsets()
  const [period,  setPeriod]  = useState<Period>('90d')
  const [statTab, setStatTab] = useState<StatTab>('Tag')
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const days  = periodDays(period)
    const since = days ? new Date(Date.now() - days * 86400_000).toISOString() : null

    let tq = supabase.from('tag_challenges')
      .select('*', { count: 'exact', head: true })
      .or(`police_id.eq.${profile.id},thief_id.eq.${profile.id}`)
    if (since) tq = tq.gte('created_at', since)

    let bq = supabase.from('bounty_challenges')
      .select('*', { count: 'exact', head: true })
      .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      .eq('status', 'complete')
    if (since) bq = bq.gte('created_at', since)

    let rq = supabase.from('ghost_runs').select('distance_km').eq('user_id', profile.id)
    if (since) rq = rq.gte('created_at', since)

    let thq = supabase.from('ratings_history')
      .select('new_rating, created_at')
      .eq('user_id', profile.id).eq('mode', 'tag')
      .order('created_at', { ascending: true })
    if (since) thq = thq.gte('created_at', since)

    let bhq = supabase.from('ratings_history')
      .select('new_rating, created_at')
      .eq('user_id', profile.id).eq('mode', 'bounty')
      .order('created_at', { ascending: true })
    if (since) bhq = bhq.gte('created_at', since)

    // Ghost runs fetched without period filter to get full score curve
    const grq = supabase.from('ghost_runs')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true })

    const [
      { count: tagCount },
      { count: bountyCount },
      { data: runs },
      { data: tagHist },
      { data: bountyHist },
      { data: ghostRuns },
    ] = await Promise.all([tq, bq, rq, thq, bhq, grq])

    const totalKm = (runs ?? []).reduce((acc, r) => acc + r.distance_km, 0)

    setStats({
      tagsPlayed:     tagCount    ?? 0,
      bountiesPlayed: bountyCount ?? 0,
      totalKm,
      tagHistory:    (tagHist    ?? []).map(h => ({ rating: h.new_rating, created_at: h.created_at })),
      bountyHistory: (bountyHist ?? []).map(h => ({ rating: h.new_rating, created_at: h.created_at })),
      ghostRuns:     (ghostRuns  ?? []) as GhostRun[],
    })
    setLoading(false)
  }, [profile.id, period])

  useEffect(() => { load() }, [load])

  function RatingChart({ history, color }: { history: { rating: number; created_at: string }[]; color: string }) {
    if (history.length < 2) {
      return <View style={spark.empty}><Text style={spark.emptyText}>No history yet</Text></View>
    }
    const chartData = history.map((h, x) => ({ x, y: h.rating }))
    const ratings   = history.map(h => h.rating)
    const minY = Math.min(...ratings) - 30
    const maxY = Math.max(...ratings) + 30
    return (
      <VictoryChart
        height={100}
        padding={{ top: 8, bottom: 24, left: 0, right: 0 }}
        domain={{ y: [minY, maxY] }}
      >
        <VictoryAxis
          style={{
            axis:       { stroke: C.border },
            ticks:      { stroke: 'transparent' },
            tickLabels: { fill: C.textMuted, fontSize: 9, fontFamily: F.body },
          }}
          tickCount={3}
          tickFormat={(t: number) => {
            const idx = Math.round(t)
            if (idx < 0 || idx >= history.length) return ''
            const d = new Date(history[idx]?.created_at ?? '')
            return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`
          }}
        />
        <VictoryArea
          data={chartData}
          style={{ data: { fill: `${color}22`, stroke: color, strokeWidth: 2 } }}
          interpolation="natural"
        />
      </VictoryChart>
    )
  }

  function GhostScoreChart({ runs }: { runs: GhostRun[] }) {
    if (runs.length < 2) {
      return <View style={spark.empty}><Text style={spark.emptyText}>Complete 2+ runs to see your score curve</Text></View>
    }
    const { dataPoints } = computeGhostScore(runs)
    const scores = dataPoints.map(p => p.y)
    const minY = 0
    const maxY = Math.max(...scores) + 10
    return (
      <VictoryChart
        height={100}
        padding={{ top: 8, bottom: 16, left: 0, right: 0 }}
        domain={{ y: [minY, maxY] }}
      >
        <VictoryAxis
          style={{
            axis:       { stroke: C.border },
            ticks:      { stroke: 'transparent' },
            tickLabels: { fill: C.textMuted, fontSize: 9, fontFamily: F.body },
          }}
          tickCount={Math.min(4, dataPoints.length)}
          tickFormat={(t: number) => {
            const idx = Math.round(t)
            if (idx < 0 || idx >= runs.length) return ''
            const d = new Date(runs[idx]?.created_at ?? '')
            return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`
          }}
        />
        <VictoryArea
          data={dataPoints}
          style={{ data: { fill: `${C.you}22`, stroke: C.you, strokeWidth: 2 } }}
          interpolation="natural"
        />
      </VictoryChart>
    )
  }

  const kmStr = stats
    ? (stats.totalKm >= 1 ? `${stats.totalKm.toFixed(0)} Km` : `${(stats.totalKm * 1000).toFixed(0)} m`)
    : '--'

  const tabColor: Record<StatTab, string> = { Tag: C.red, Bounty: C.primary, Ghost: C.you }

  function GhostPBs({ runs }: { runs: GhostRun[] }) {
    if (runs.length === 0) {
      return <View style={spark.empty}><Text style={spark.emptyText}>No runs yet</Text></View>
    }
    const bestPace = runs.reduce((b, r) => r.avg_pace_s_per_km < b.avg_pace_s_per_km ? r : b)
    const longestDist = runs.reduce((b, r) => r.distance_km > b.distance_km ? r : b)
    const longestTime = runs.reduce((b, r) => r.duration_s > b.duration_s ? r : b)
    return (
      <View style={s.pbCard}>
        <PBRow icon="flash-outline" label="Best Pace" value={fmtPace(bestPace.avg_pace_s_per_km)} color={C.you} />
        <PBRow icon="map-outline"   label="Longest Run" value={`${longestDist.distance_km.toFixed(2)} km`} color={C.you} />
        <PBRow icon="time-outline"  label="Longest Time" value={fmtSecs(longestTime.duration_s)} color={C.you} />
        <PBRow icon="trending-up-outline" label="Ghost Score" value={String(ghostScore)} color={C.you} />
      </View>
    )
  }

  return (
    <ScrollView style={[s.root, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

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
              <Ionicons name="body-outline" size={24} color={C.red} />
              <Text style={s.tileNum}>{stats.tagsPlayed}</Text>
              <Text style={s.tileLabel}>Tags</Text>
            </View>
            <View style={s.tile}>
              <Ionicons name="trophy-outline" size={24} color={C.primary} />
              <Text style={s.tileNum}>{stats.bountiesPlayed}</Text>
              <Text style={s.tileLabel}>Bounties</Text>
            </View>
            <View style={s.tile}>
              <Ionicons name="footsteps-outline" size={24} color={C.you} />
              <Text style={s.tileNum}>{stats.ghostRuns.length}</Text>
              <Text style={s.tileLabel}>Runs</Text>
            </View>
          </View>

          {/* Mode tab toggle */}
          <View style={s.statTabs}>
            {(['Tag', 'Bounty', 'Ghost'] as StatTab[]).map(t => (
              <TouchableOpacity key={t} style={[s.statTab, statTab === t && s.statTabActive]}
                onPress={() => setStatTab(t)}>
                <Text style={[s.statTabText, statTab === t && { color: tabColor[t], fontFamily: F.bodyBold }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {statTab === 'Ghost' ? (
            <>
              {/* Ghost score chart */}
              <View style={s.chartCard}>
                <View style={s.chartHeader}>
                  <Text style={s.chartLabel}>Ghost Score</Text>
                  <Text style={[s.chartValue, { color: C.you }]}>{ghostScore}</Text>
                </View>
                <View style={{ overflow: 'hidden' }}>
                  <GhostScoreChart runs={stats.ghostRuns} />
                </View>
              </View>

              {/* PBs */}
              <GhostPBs runs={stats.ghostRuns} />
            </>
          ) : (
            <>
              {/* ELO chart for Tag or Bounty */}
              <View style={s.chartCard}>
                <View style={s.chartHeader}>
                  <Text style={s.chartLabel}>{statTab} Rating</Text>
                  <Text style={[s.chartValue, { color: tabColor[statTab] }]}>
                    {statTab === 'Tag' ? profile.tag_rating : profile.bounty_rating}
                  </Text>
                </View>
                <View style={{ flex: 1, overflow: 'hidden' }}>
                  <RatingChart
                    history={statTab === 'Tag' ? stats.tagHistory : stats.bountyHistory}
                    color={tabColor[statTab]}
                  />
                </View>
              </View>

              {/* Km total */}
              <View style={s.kmRow}>
                <Text style={s.kmValue}>{kmStr}</Text>
                <View style={s.kmComparison}>
                  <View style={[s.dot, { backgroundColor: tabColor[statTab] }]} />
                  <Text style={s.kmPeriodLabel}>{PERIODS.find(p => p.value === period)?.label}</Text>
                </View>
              </View>
            </>
          )}
        </>
      ) : null}

      <View style={{ height: insets.bottom + S.xl }} />
    </ScrollView>
  )
}

function fmtSecs(secs: number) {
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}m ${s}s`
}

function PBRow({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <View style={pb.row}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={pb.label}>{label}</Text>
      <Text style={[pb.value, { color }]}>{value}</Text>
    </View>
  )
}
const pb = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: S.sm },
  label: { flex: 1, color: C.textSub, fontSize: 14 },
  value: { fontSize: 16, fontFamily: F.bodyBold },
})

const spark = StyleSheet.create({
  empty:     { justifyContent: 'center', alignItems: 'center', height: 80 },
  emptyText: { color: C.textMuted, fontSize: 13 },
})

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },

  miniProfile:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.md },
  miniName:         { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },

  periodScroll:     { marginBottom: S.md },
  periodRow:        { paddingHorizontal: S.lg, gap: S.lg },
  periodBtn:        { paddingVertical: 14 },
  periodBtnActive:  {},
  periodText:       { color: C.textSub, fontSize: 14 },
  periodTextActive: { color: C.text, fontWeight: '700', fontFamily: F.bodyBold },
  periodUnderline:  { height: 2, backgroundColor: C.text, borderRadius: 1, marginTop: 4 },

  tilesRow:         { flexDirection: 'row', paddingHorizontal: S.lg, gap: S.md, marginBottom: S.lg },
  tile:             { flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: S.md, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.border },
  tileNum:          { color: C.text, fontSize: 32, fontFamily: F.display },
  tileLabel:        { color: C.textSub, fontSize: 12 },

  statTabs:         { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.md, gap: S.xs },
  statTab:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: R.md, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  statTabActive:    { borderColor: 'transparent' },
  statTabText:      { color: C.textMuted, fontSize: 14, fontWeight: '600' },

  chartCard:        { backgroundColor: C.card, marginHorizontal: S.lg, borderRadius: R.lg, padding: S.md, marginBottom: S.md, borderWidth: 1, borderColor: C.border },
  chartHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: S.xs },
  chartLabel:       { color: C.textSub, fontSize: 13 },
  chartValue:       { fontSize: 22, fontFamily: F.display },

  pbCard:           { backgroundColor: C.card, marginHorizontal: S.lg, borderRadius: R.lg, paddingHorizontal: S.md, marginBottom: S.md, borderWidth: 1, borderColor: C.border },

  kmRow:            { paddingHorizontal: S.lg, marginBottom: S.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kmValue:          { color: C.text, fontSize: 48, fontFamily: F.display },
  kmComparison:     { flexDirection: 'row', alignItems: 'center', gap: S.xs, marginBottom: S.sm },
  dot:              { width: 8, height: 8, borderRadius: 4 },
  kmPeriodLabel:    { color: C.textSub, fontSize: 13 },
})
