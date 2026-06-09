import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Switch, RefreshControl,
  useWindowDimensions, Share, Animated, Platform, Modal,
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

  function onScrollEnd(x: number) {
    if (pendingSnap.current) clearTimeout(pendingSnap.current)
    pendingSnap.current = setTimeout(() => snapTo(x), Platform.OS === 'android' ? 60 : 0)
  }

  return (
    <View style={drum.wrapper}>
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
  // Tag is the default mode
  const [mode,          setMode]          = useState<Mode>('Tag')
  const [lobby,         setLobby]         = useState(false)
  const [lobbyCode,     setLobbyCode]     = useState<string | null>(null)
  const [lobbyCreating, setLobbyCreating] = useState(false)
  const [lobbyGuest,    setLobbyGuest]    = useState<Profile | null>(null)
  const [showQrModal,   setShowQrModal]   = useState(false)
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

  // Watch for a guest joining the lobby so the thief slot updates in real-time
  useEffect(() => {
    if (!lobbyCode) { setLobbyGuest(null); return }

    const channel = supabase
      .channel(`lobby-home-${lobbyCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'lobbies',
        filter: `code=eq.${lobbyCode}`,
      }, async (payload) => {
        const guestId = (payload.new as any).guest_id as string | null
        if (guestId) {
          const { data } = await supabase.from('profiles').select('*').eq('id', guestId).single()
          if (data) setLobbyGuest(data as Profile)
        } else {
          setLobbyGuest(null)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [lobbyCode])

  // Lobby management (Tag mode only)
  async function handleLobbyToggle(on: boolean) {
    if (!on) {
      if (lobbyCode) {
        await supabase.from('lobbies').delete().eq('code', lobbyCode).eq('host_id', profile.id)
      }
      setLobby(false)
      setLobbyCode(null)
      setLobbyGuest(null)
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
    if (!lobby) {
      Alert.alert('Enable Lobby', 'Turn on "Create Lobby" above to invite a friend and start a Tag game.')
      return
    }
    if (!lobbyCode) return
    if (!lobbyGuest) {
      Alert.alert('No opponent yet', 'Share your lobby QR so a friend can join, then start the chase.')
      return
    }
    const headStart = Math.min(500, Math.max(0, (profile.tag_rating - lobbyGuest.tag_rating) * 0.5))
    onStartTag({
      lobbyCode,
      myRole:           'police',
      opponentProfile:  lobbyGuest,
      durationMinutes:  timeMinutes,
      headStartMetres:  headStart,
    })
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
        {/* Tag requires a real lobby — use the QR/code flow above; no per-friend shortcut */}
      </View>
    )
  }

  const visibleRuns = runsExpanded ? pastRuns : pastRuns.slice(0, 3)

  // Footer height: drum picker (72) + label (28) + play button (56) + padding
  const FOOTER_HEIGHT = 172

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

            {/* Lobby card — police/thief split */}
            {lobby && lobbyCode && (
              <>
                <View style={s.lobbyCard}>
                  {/* Police side */}
                  <View style={[s.lobbyHalf, s.lobbyHalfPolice]}>
                    <Text style={[s.lobbyRoleLabel, { color: C.red }]}>POLICE</Text>
                    <Avatar username={profile.username} size={44} />
                    <Text style={s.lobbyPlayerName} numberOfLines={1}>{profile.username}</Text>
                    <Text style={s.lobbyRatingText}>({profile.tag_rating})</Text>
                  </View>

                  {/* Vertical divider */}
                  <View style={s.lobbyDivider} />

                  {/* Thief side */}
                  <View style={[s.lobbyHalf, s.lobbyHalfThief]}>
                    <Text style={[s.lobbyRoleLabel, { color: C.primary }]}>THIEF</Text>
                    {lobbyGuest ? (
                      <>
                        <Avatar username={lobbyGuest.username} size={44} />
                        <Text style={s.lobbyPlayerName} numberOfLines={1}>{lobbyGuest.username}</Text>
                        <Text style={s.lobbyRatingText}>({lobbyGuest.tag_rating})</Text>
                      </>
                    ) : (
                      <View style={s.lobbyWaiting}>
                        <ActivityIndicator color={C.textMuted} size="small" />
                        <Text style={s.lobbyWaitingText}>Waiting...</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Share QR — opens modal */}
                <TouchableOpacity style={s.shareQrBtn} onPress={() => setShowQrModal(true)} activeOpacity={0.8}>
                  <Text style={s.shareQrText}>Share QR</Text>
                </TouchableOpacity>
              </>
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
          </>
        )}

        {/* ── GHOST MODE ───────────────────────────────────────────────────── */}
        {mode === 'Ghost' && (
          <>
            {/* Friends list */}
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
                    <TouchableOpacity style={s.challengeRunBtn} onPress={() => onViewPastRun(run)}>
                      <Text style={s.challengeRunText}>Challenge</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Spacer so content doesn't hide behind fixed footer */}
        <View style={{ height: FOOTER_HEIGHT + insets.bottom }} />
      </ScrollView>

      {/* Fixed footer: timer drum + play button — always in the same position */}
      <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
        <Text style={s.footerTimerLabel}>DURATION</Text>
        <TimeDrumPicker value={timeMinutes} onChange={setTimeMinutes} />
        {mode === 'Ghost' ? (
          <TouchableOpacity style={s.playBtn} onPress={onStartFreeRun} activeOpacity={0.85}>
            <Text style={s.playBtnText}>Play</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.playBtn, { backgroundColor: C.red }]}
            onPress={handlePlayTag}
            activeOpacity={0.85}
            disabled={lobby && !lobbyCode}
          >
            <Text style={s.playBtnText}>
              {lobby ? (lobbyCode ? 'Start Chase' : 'Creating…') : 'Play Tag'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* QR code modal */}
      <Modal
        visible={showQrModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowQrModal(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowQrModal(false)}
        >
          <View style={s.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Join Lobby</Text>
            <View style={s.qrBox}>
              <QRCode
                value={`chase://lobby/${lobbyCode ?? ''}`}
                size={200}
                backgroundColor={C.card}
                color={C.text}
              />
            </View>
            <Text style={s.lobbyCodeText}>{lobbyCode}</Text>
            <Text style={s.lobbyCodeHint}>Scan or share code to join</Text>
            <TouchableOpacity
              style={s.qrShareBtn}
              activeOpacity={0.85}
              onPress={() => {
                Share.share({ message: `Join my Chase lobby!\nCode: ${lobbyCode}\nchase://lobby/${lobbyCode}` })
              }}
            >
              <Ionicons name="share-outline" size={16} color={C.bg} />
              <Text style={s.qrShareBtnText}>Share Code</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalClose} onPress={() => setShowQrModal(false)}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
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

  // Incoming challenges
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

  // Lobby toggle row
  lobbyRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: S.md },
  lobbyLabel:      { color: C.text, fontSize: 16, fontWeight: '600' },
  lobbySub:        { color: C.textSub, fontSize: 12, marginTop: 2 },

  // Lobby card — split design
  lobbyCard:       { flexDirection: 'row', marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.lg, overflow: 'hidden', height: 140, marginBottom: S.sm },
  lobbyHalf:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: S.md },
  lobbyHalfPolice: { backgroundColor: 'rgba(255,59,59,0.08)' },
  lobbyHalfThief:  { backgroundColor: 'rgba(61,123,255,0.08)' },
  lobbyDivider:    { width: 1, backgroundColor: C.border },
  lobbyRoleLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: F.bodyBold },
  lobbyPlayerName: { color: C.text, fontSize: 13, fontWeight: '600', maxWidth: 100, textAlign: 'center' },
  lobbyRatingText: { color: C.textSub, fontSize: 11 },
  lobbyWaiting:    { alignItems: 'center', gap: S.xs },
  lobbyWaitingText:{ color: C.textMuted, fontSize: 12 },

  // Share QR button (opens modal)
  shareQrBtn:      { marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', marginBottom: S.md },
  shareQrText:     { color: C.text, fontWeight: '600', fontSize: 15 },

  // Section
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

  // Fixed footer — timer + play button, always above the tab bar
  footer:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, paddingHorizontal: S.lg, paddingTop: S.xs, borderTopWidth: 0.5, borderTopColor: C.border },
  footerTimerLabel:{ color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center', marginBottom: 0 },

  // Play button
  playBtn:         { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 18, alignItems: 'center', marginTop: S.xs },
  playBtnText:     { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.display },

  // QR Modal
  modalBackdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:      { backgroundColor: C.card, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: S.xl, alignItems: 'center', gap: S.md },
  modalHandle:     { width: 40, height: 4, backgroundColor: C.border, borderRadius: R.full, marginBottom: S.sm },
  modalTitle:      { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: F.displayBold },
  qrBox:           { backgroundColor: C.cardDeep, borderRadius: R.lg, padding: S.lg },
  lobbyCodeText:   { color: C.text, fontSize: 32, fontFamily: F.display, letterSpacing: 6 },
  lobbyCodeHint:   { color: C.textSub, fontSize: 13 },
  qrShareBtn:      { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 14, paddingHorizontal: S.xl, gap: S.sm, width: '100%', justifyContent: 'center' },
  qrShareBtnText:  { color: C.bg, fontWeight: '700', fontSize: 16, fontFamily: F.displayBold },
  modalClose:      { paddingVertical: S.sm },
  modalCloseText:  { color: C.textSub, fontSize: 15 },

  empty:           { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: S.xl },
})
