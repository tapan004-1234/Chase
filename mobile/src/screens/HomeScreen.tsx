import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Switch, RefreshControl,
  useWindowDimensions, Share, Animated, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { GhostChallenge, GhostRun, Profile, TagParameters } from '../types'

interface Props {
  profile:             Profile
  onStartFreeRun:      () => void
  onAcceptChallenge:   (c: GhostChallenge) => void
  onChallengeFriend:   (friend: Profile, latestRun: GhostRun | null) => void
  onStartTag:          (params: TagParameters) => void
  onViewPastRun:       (run: GhostRun) => void
}

type Mode = 'Tag' | 'Ghost'

interface KnownPlayer { profile: Profile; wins: number; losses: number }

// ── Smooth drum picker ───────────────────────────────────────────────────────

const DRUM_W   = 60
const TIME_MIN = 1
const TIME_MAX = 90
const TIME_ITEMS = Array.from({ length: TIME_MAX - TIME_MIN + 1 }, (_, i) => i + TIME_MIN)

function TimeDrumPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { width } = useWindowDimensions()
  const pad = (width - DRUM_W) / 2
  const ref = useRef<ScrollView>(null)
  const pendingSnap = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to value on mount
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ x: (value - TIME_MIN) * DRUM_W, animated: false })
    }, 100)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function snapTo(offsetX: number) {
    const idx = Math.round(offsetX / DRUM_W)
    const clamped = Math.max(0, Math.min(idx, TIME_ITEMS.length - 1))
    ref.current?.scrollTo({ x: clamped * DRUM_W, animated: true })
    const next = TIME_ITEMS[clamped]
    if (next !== value) onChange(next)
  }

  // onScrollEndDrag catches slow lifts; onMomentumScrollEnd catches flicks
  function onScrollEnd(x: number) {
    if (pendingSnap.current) clearTimeout(pendingSnap.current)
    // Small delay lets native momentum fire first so we don't double-snap
    pendingSnap.current = setTimeout(() => snapTo(x), Platform.OS === 'android' ? 60 : 0)
  }

  return (
    <View style={drum.wrapper}>
      {/* Center selection highlight */}
      <View pointerEvents="none" style={[drum.highlight, { left: pad, width: DRUM_W }]} />

      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate={Platform.OS === 'ios' ? 0.92 : 0.98}
        snapToInterval={DRUM_W}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: pad }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          if (pendingSnap.current) clearTimeout(pendingSnap.current)
          snapTo(e.nativeEvent.contentOffset.x)
        }}
        onScrollEndDrag={e => onScrollEnd(e.nativeEvent.contentOffset.x)}
      >
        {TIME_ITEMS.map(item => {
          const sel = item === value
          return (
            <TouchableOpacity
              key={item}
              activeOpacity={0.7}
              onPress={() => {
                if (pendingSnap.current) clearTimeout(pendingSnap.current)
                const idx = item - TIME_MIN
                ref.current?.scrollTo({ x: idx * DRUM_W, animated: true })
                onChange(item)
              }}
              style={drum.item}
            >
              <Text style={[drum.num, sel && drum.numSel]}>{item}</Text>
              {sel && <Text style={drum.unit}>min</Text>}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const drum = StyleSheet.create({
  wrapper:   { position: 'relative', height: 72 },
  highlight: { position: 'absolute', top: 4, bottom: 4, borderRadius: R.md, backgroundColor: C.card, zIndex: 0 },
  item:      { width: DRUM_W, height: 72, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  num:       { color: C.textMuted, fontSize: 18, fontFamily: F.body },
  numSel:    { color: C.text, fontSize: 30, fontFamily: F.display },
  unit:      { color: C.textSub, fontSize: 11, fontFamily: F.body, marginTop: -2 },
})

// ── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ profile, onStartFreeRun, onAcceptChallenge, onChallengeFriend, onStartTag, onViewPastRun }: Props) {
  const insets = useSafeAreaInsets()
  const [mode,          setMode]          = useState<Mode>('Ghost')
  const [lobby,         setLobby]         = useState(false)
  const [lobbyCode,     setLobbyCode]     = useState<string | null>(null)
  const [lobbyCreating, setLobbyCreating] = useState(false)
  const [timeMinutes,   setTimeMinutes]   = useState(10)
  const [players,       setPlayers]       = useState<KnownPlayer[]>([])
  const [recommended,   setRecommended]   = useState<KnownPlayer | null>(null)
  const [latestRun,     setLatestRun]     = useState<GhostRun | null>(null)
  const [pastRuns,      setPastRuns]      = useState<GhostRun[]>([])
  const [incoming,      setIncoming]      = useState<GhostChallenge[]>([])
  const [loading,       setLoading]       = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [runsExpanded,  setRunsExpanded]  = useState(false)

  const load = useCallback(async () => {
    const uid = profile.id
    const [
      { data: runs },
      { data: done },
      { data: friendReqs },
      { data: pend },
      { data: myRuns },
    ] = await Promise.all([
      supabase.from('ghost_runs').select('*').eq('user_id', uid)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('ghost_challenges')
        .select('*, challenger:profiles!challenger_id(*), opponent:profiles!opponent_id(*)')
        .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
        .eq('status', 'completed'),
      supabase.from('friend_requests')
        .select('*, from_profile:profiles!from_id(*), to_profile:profiles!to_id(*)')
        .or(`from_id.eq.${uid},to_id.eq.${uid}`)
        .eq('status', 'accepted'),
      supabase.from('ghost_challenges')
        .select('*, challenger:profiles!challenger_id(*), challenger_run:ghost_runs!challenger_run_id(*)')
        .eq('opponent_id', uid).eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('ghost_runs').select('*').eq('user_id', uid)
        .order('created_at', { ascending: false }).limit(20),
    ])

    setLatestRun(runs?.[0] ?? null)
    setPastRuns((myRuns as GhostRun[]) ?? [])

    const challenges = (done as GhostChallenge[]) ?? []
    const map = new Map<string, KnownPlayer>()
    for (const c of challenges) {
      const other = c.challenger_id === uid ? c.opponent : c.challenger
      if (!other) continue
      const existing = map.get(other.id) ?? { profile: other, wins: 0, losses: 0 }
      if (c.winner_id === uid) existing.wins++
      else existing.losses++
      map.set(other.id, existing)
    }
    for (const req of (friendReqs as any[]) ?? []) {
      const other: Profile = req.from_id === uid ? req.to_profile : req.from_profile
      if (!other || map.has(other.id)) continue
      map.set(other.id, { profile: other, wins: 0, losses: 0 })
    }
    const sorted = [...map.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))
    setPlayers(sorted)
    setRecommended(sorted[0] ?? null)
    setIncoming((pend as GhostChallenge[]) ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])

  // Lobby management (Tag mode only)
  async function handleLobbyToggle(on: boolean) {
    if (!on) {
      // Delete the active lobby from DB if we created one
      if (lobbyCode) {
        await supabase.from('lobbies').delete().eq('code', lobbyCode).eq('host_id', profile.id)
      }
      setLobby(false)
      setLobbyCode(null)
      return
    }
    setLobby(true)
    setLobbyCreating(true)
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    const { error } = await supabase.from('lobbies').insert({
      host_id: profile.id,
      code,
      duration_minutes: timeMinutes,
      expires_at: expiresAt,
    })
    if (!error) setLobbyCode(code)
    setLobbyCreating(false)
  }

  function handlePlayTag() {
    if (lobby && lobbyCode) {
      // Navigate to pre-game screen with host role
      const opponent = players[0]?.profile ?? null
      if (!opponent) return
      const headStart = Math.min(500, Math.max(0, (profile.tag_rating - opponent.tag_rating) * 0.5))
      onStartTag({
        lobbyCode,
        myRole:           'police',
        opponentProfile:  opponent,
        durationMinutes:  timeMinutes,
        headStartMetres:  headStart,
      })
    }
    // Non-lobby Tag: for now, no-op (requires opponent selection flow)
  }

  function wlLabel(w: number, l: number) {
    return (
      <Text style={s.wlText}>
        <Text style={[s.wlNum, w > 0 && s.winColor]}>{w}W</Text>
        <Text style={s.wlSep}> / </Text>
        <Text style={[s.wlNum, l > 0 && s.lossColor]}>{l}L</Text>
        <Text style={s.wlSep}> / 0D</Text>
      </Text>
    )
  }

  function formatPace(secs: number): string {
    if (secs <= 0 || !isFinite(secs)) return '--:--'
    return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')} /km`
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function renderFriend({ item }: { item: KnownPlayer }) {
    return (
      <View style={s.friendRow}>
        <Avatar username={item.profile.username} size={44} />
        <View style={s.friendInfo}>
          <Text style={s.friendName}>{item.profile.username}
            <Text style={s.friendRating}> ({item.profile.ghost_rating})</Text>
          </Text>
          {wlLabel(item.wins, item.losses)}
        </View>
        {mode === 'Ghost' && (
          <TouchableOpacity style={s.challengeBtn}
            onPress={() => onChallengeFriend(item.profile, latestRun)}>
            <Text style={s.challengeBtnText}>Challenge</Text>
          </TouchableOpacity>
        )}
        {mode === 'Tag' && (
          <TouchableOpacity style={[s.challengeBtn, { backgroundColor: C.red }]}
            onPress={() => {
              const headStart = Math.min(500, Math.max(0, (profile.tag_rating - item.profile.tag_rating) * 0.5))
              onStartTag({
                lobbyCode:       `direct-${profile.id.slice(0, 6)}`,
                myRole:          'police',
                opponentProfile: item.profile,
                durationMinutes: timeMinutes,
                headStartMetres: headStart,
              })
            }}>
            <Text style={s.challengeBtnText}>Tag</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const visibleRuns = runsExpanded ? pastRuns : pastRuns.slice(0, 3)

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.text} />}
      >
        {/* Recommended Match */}
        {recommended && (
          <View style={s.recommendCard}>
            <View style={s.vsBox}>
              <View style={[s.vsHalf, { backgroundColor: C.red }]}>
                <Avatar username={profile.username} size={28} radius={6} />
              </View>
              <View style={[s.vsHalf, { backgroundColor: C.primary }]}>
                <Avatar username={recommended.profile.username} size={28} radius={6} />
              </View>
              <View style={s.vsLabel}><Text style={s.vsText}>VS</Text></View>
            </View>
            <View style={s.recommendInfo}>
              <Text style={s.recommendTitle}>Recommended Match</Text>
              <Text style={s.recommendSub}>Recent Opponent</Text>
              <Text style={s.recommendName}>
                {recommended.profile.username}
                <Text style={s.friendRating}> ({recommended.profile.ghost_rating})</Text>
              </Text>
              <View style={s.wlRow}>{wlLabel(recommended.wins, recommended.losses)}</View>
            </View>
          </View>
        )}

        {/* Incoming ghost challenges */}
        {incoming.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>CHALLENGES FOR YOU</Text>
            {incoming.map(c => (
              <TouchableOpacity key={c.id} style={s.incomingCard} onPress={() => onAcceptChallenge(c)}>
                <Avatar username={c.challenger?.username ?? '?'} size={40} />
                <View style={s.incomingInfo}>
                  <Text style={s.friendName}>{c.challenger?.username}</Text>
                  {c.challenger_run && (
                    <Text style={s.incomingStats}>
                      {c.challenger_run.distance_km.toFixed(2)} km · {formatPace(c.challenger_run.avg_pace_s_per_km)}
                    </Text>
                  )}
                </View>
                <View style={s.beatBtn}>
                  <Text style={s.beatBtnText}>Beat →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Tag / Ghost toggle */}
        <View style={s.modeToggleWrap}>
          <View style={s.modeToggle}>
            {(['Tag', 'Ghost'] as Mode[]).map(m => (
              <TouchableOpacity key={m} style={[s.modeTab, mode === m && s.modeTabActive]}
                onPress={() => setMode(m)}>
                <Text style={[s.modeTabText, mode === m && s.modeTabTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── TAG MODE ─────────────────────────────────────────────────────── */}
        {mode === 'Tag' && (
          <>
            {/* Lobby toggle */}
            <View style={s.lobbyRow}>
              <View>
                <Text style={s.lobbyLabel}>Create Lobby</Text>
                <Text style={s.lobbySub}>Invite friends with a QR code</Text>
              </View>
              {lobbyCreating
                ? <ActivityIndicator color={C.primary} />
                : <Switch value={lobby} onValueChange={handleLobbyToggle}
                    trackColor={{ false: C.border, true: C.primary }}
                    thumbColor={C.text} />
              }
            </View>

            {/* Lobby QR panel */}
            {lobby && lobbyCode && (
              <View style={s.qrPanel}>
                <View style={s.qrBox}>
                  <QRCode
                    value={`chase://lobby/${lobbyCode}`}
                    size={160}
                    backgroundColor="#1A1A1A"
                    color="#FFFFFF"
                  />
                </View>
                <Text style={s.lobbyCode}>{lobbyCode}</Text>
                <Text style={s.lobbyCodeHint}>Share this code or scan to join</Text>
                <TouchableOpacity style={s.shareQrBtn} onPress={() => {
                  Share.share({ message: `Join my Chase lobby: ${lobbyCode}` })
                }}>
                  <Ionicons name="share-outline" size={16} color={C.text} />
                  <Text style={s.shareQrText}>Share QR</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Friends list in Tag mode */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionTitleRow}>
                  <Text style={s.sectionTitle}>FRIENDS</Text>
                  {players.length > 0 && (
                    <View style={s.badge}><Text style={s.badgeText}>{players.length}</Text></View>
                  )}
                </View>
              </View>
              {loading
                ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
                : players.length === 0
                  ? <Text style={s.empty}>Add friends to challenge them to Tag.</Text>
                  : players.slice(0, 5).map(p => (
                      <View key={p.profile.id}>{renderFriend({ item: p })}</View>
                    ))
              }
            </View>

            {/* Time selector */}
            <View style={s.timeSection}>
              <Text style={s.timeSectionLabel}>DURATION</Text>
              <TimeDrumPicker value={timeMinutes} onChange={setTimeMinutes} />
            </View>
          </>
        )}

        {/* ── GHOST MODE ───────────────────────────────────────────────────── */}
        {mode === 'Ghost' && (
          <>
            {/* Friends list in Ghost mode */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionTitleRow}>
                  <Text style={s.sectionTitle}>FRIENDS</Text>
                  {players.length > 0 && (
                    <View style={s.badge}><Text style={s.badgeText}>{players.length}</Text></View>
                  )}
                </View>
                <TouchableOpacity style={{ padding: S.xs }}>
                  <Text style={s.viewAll}>View All</Text>
                </TouchableOpacity>
              </View>
              {loading
                ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
                : players.length === 0
                  ? <Text style={s.empty}>Run with friends to build your rivalries.</Text>
                  : players.slice(0, 5).map(p => (
                      <View key={p.profile.id}>{renderFriend({ item: p })}</View>
                    ))
              }
            </View>

            {/* Time selector */}
            <View style={s.timeSection}>
              <Text style={s.timeSectionLabel}>TIME</Text>
              <TimeDrumPicker value={timeMinutes} onChange={setTimeMinutes} />
            </View>

            {/* Past runs */}
            {pastRuns.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>MY RUNS</Text>
                  {pastRuns.length > 3 && (
                    <TouchableOpacity onPress={() => setRunsExpanded(v => !v)} style={{ padding: S.xs }}>
                      <Text style={s.viewAll}>{runsExpanded ? 'Show less' : `View all ${pastRuns.length}`}</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {visibleRuns.map(run => (
                  <View key={run.id} style={s.runRow}>
                    <View style={s.runIconWrap}>
                      <Ionicons name="timer-outline" size={18} color={C.primary} />
                    </View>
                    <View style={s.runInfo}>
                      <Text style={s.runDist}>{run.distance_km.toFixed(2)} km</Text>
                      <Text style={s.runMeta}>{formatPace(run.avg_pace_s_per_km)} · {formatDate(run.created_at)}</Text>
                    </View>
                    <TouchableOpacity style={s.challengeRunBtn}
                      onPress={() => onViewPastRun(run)}>
                      <Text style={s.challengeRunText}>Challenge</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Play button — fixed above tab bar */}
      <View style={[s.playWrap, { paddingBottom: insets.bottom + S.sm }]}>
        {mode === 'Ghost' && (
          <TouchableOpacity style={s.playBtn} onPress={onStartFreeRun} activeOpacity={0.85}>
            <Text style={s.playBtnText}>Play</Text>
          </TouchableOpacity>
        )}
        {mode === 'Tag' && (
          <TouchableOpacity
            style={[s.playBtn, { backgroundColor: C.red }]}
            onPress={handlePlayTag}
            activeOpacity={0.85}
            disabled={lobby && !lobbyCode}
          >
            <Text style={s.playBtnText}>{lobby ? (lobbyCode ? 'Start Lobby' : 'Creating…') : 'Play Tag'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

function formatPace(secsPerKm: number): string {
  const m = Math.floor(secsPerKm / 60)
  const s = Math.floor(secsPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },

  // Recommended Match
  recommendCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, margin: S.md, borderRadius: R.lg, padding: S.md, gap: S.md },
  vsBox:           { width: 56, height: 56, borderRadius: R.sm, overflow: 'hidden', flexDirection: 'row', position: 'relative' },
  vsHalf:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  vsLabel:         { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  vsText:          { color: C.text, fontSize: 10, fontWeight: '800' },
  recommendInfo:   { flex: 1 },
  recommendTitle:  { color: C.text, fontSize: 13, fontWeight: '700' },
  recommendSub:    { color: C.textSub, fontSize: 11, marginBottom: 2 },
  recommendName:   { color: C.text, fontSize: 15, fontWeight: '600' },
  wlRow:           { marginTop: 2 },

  // W/L labels
  wlText:          { fontSize: 12 },
  wlNum:           { color: C.textMuted, fontFamily: F.displayBold, fontSize: 14 },
  winColor:        { color: C.green },
  lossColor:       { color: C.red },
  wlSep:           { color: C.textMuted },

  // Incoming
  incomingCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, gap: S.md },
  incomingInfo:    { flex: 1 },
  incomingStats:   { color: C.textSub, fontSize: 13, marginTop: 2 },
  beatBtn:         { backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12 },
  beatBtnText:     { color: C.text, fontWeight: '700', fontSize: 14 },

  // Mode toggle
  modeToggleWrap:  { paddingHorizontal: S.lg, marginTop: S.sm },
  modeToggle:      { flexDirection: 'row', backgroundColor: C.card, borderRadius: R.full, padding: 4 },
  modeTab:         { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: R.full },
  modeTabActive:   { backgroundColor: C.cardDeep },
  modeTabText:     { color: C.textSub, fontSize: 16, fontWeight: '600' },
  modeTabTextActive: { color: C.text },

  // Lobby (Tag only)
  lobbyRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: S.md },
  lobbyLabel:      { color: C.text, fontSize: 16, fontWeight: '600' },
  lobbySub:        { color: C.textSub, fontSize: 12, marginTop: 2 },

  // QR panel
  qrPanel:         { marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, alignItems: 'center', marginBottom: S.md },
  qrBox:           { backgroundColor: '#1A1A1A', borderRadius: R.md, padding: S.md, marginBottom: S.md },
  lobbyCode:       { color: C.text, fontSize: 28, fontFamily: F.display, letterSpacing: 6, marginBottom: 4 },
  lobbyCodeHint:   { color: C.textSub, fontSize: 13, marginBottom: S.md },
  shareQrBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardDeep, borderRadius: R.md, paddingHorizontal: S.lg, paddingVertical: 12, gap: S.sm },
  shareQrText:     { color: C.text, fontWeight: '600', fontSize: 14 },

  // Section — S.lg for HIG standard margin
  section:         { paddingHorizontal: S.lg, marginTop: S.sm },
  sectionHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  sectionTitle:    { color: C.textSub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  badge:           { backgroundColor: C.card, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:       { color: C.text, fontSize: 11, fontWeight: '700' },
  viewAll:         { color: C.textSub, fontSize: 13 },

  // Friend row
  friendRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: S.sm },
  friendInfo:      { flex: 1 },
  friendName:      { color: C.text, fontSize: 15, fontWeight: '600' },
  friendRating:    { color: C.textSub, fontWeight: '400' },
  challengeBtn:    { backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 11 },
  challengeBtnText:{ color: C.text, fontWeight: '700', fontSize: 14 },

  // Past runs
  runRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: S.sm },
  runIconWrap:     { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.card, justifyContent: 'center', alignItems: 'center' },
  runInfo:         { flex: 1 },
  runDist:         { color: C.text, fontSize: 15, fontWeight: '600', fontFamily: F.displayBold },
  runMeta:         { color: C.textSub, fontSize: 12, marginTop: 2 },
  challengeRunBtn: { backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 8 },
  challengeRunText:{ color: C.textSub, fontSize: 12, fontWeight: '600' },

  // Time drum picker
  timeSection:      { marginTop: S.sm },
  timeSectionLabel: { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: S.lg, marginBottom: 4 },

  // Play button
  playWrap:        { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.lg, paddingTop: S.sm, backgroundColor: C.bg },
  playBtn:         { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 18, alignItems: 'center' },
  playBtnText:     { color: C.text, fontSize: 20, fontWeight: '700' },

  empty:           { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: S.xl },
})
