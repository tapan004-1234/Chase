import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Switch, RefreshControl,
  useWindowDimensions, Share, Modal, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { AppMode, BountyChallenge, BountyParameters, GhostRun, Profile, TagParameters } from '../types'
import { fmtPace, fmtTime } from '../lib/formatters'

interface Props {
  profile:          Profile
  ghostScore:       number
  onStartFreeRun:   () => void
  onStartBountyRun: (params: BountyParameters) => void
  onStartTag:       (params: TagParameters) => void
  onViewPastRun:    (run: GhostRun) => void
}

type Mode = AppMode

interface KnownPlayer { profile: Profile; wins: number; losses: number }
type WLMap = Record<string, { wins: number; losses: number }>

// ── Smooth drum picker ───────────────────────────────────────────────────────

const DRUM_W   = 60
const TIME_MIN = 1
const TIME_MAX = 90
const TIME_ITEMS = Array.from({ length: TIME_MAX - TIME_MIN + 1 }, (_, i) => i + TIME_MIN)

function TimeDrumPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { width } = useWindowDimensions()
  const pad = (width - DRUM_W) / 2
  const ref = useRef<FlatList<number>>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollToOffset({ offset: (value - TIME_MIN) * DRUM_W, animated: false })
    }, 100)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={drum.wrapper}>
      <View pointerEvents="none" style={[drum.highlight, { left: pad, width: DRUM_W }]} />
      <FlatList
        ref={ref}
        data={TIME_ITEMS}
        horizontal
        keyExtractor={item => String(item)}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={DRUM_W}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: pad }}
        getItemLayout={(_, index) => ({ length: DRUM_W, offset: DRUM_W * index, index })}
        scrollEventThrottle={32}
        nestedScrollEnabled
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / DRUM_W)
          const next = TIME_ITEMS[Math.max(0, Math.min(idx, TIME_ITEMS.length - 1))]
          if (next !== value) onChange(next)
        }}
        renderItem={({ item }) => {
          const sel = item === value
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                ref.current?.scrollToOffset({ offset: (item - TIME_MIN) * DRUM_W, animated: true })
                onChange(item)
              }}
              style={drum.item}
            >
              <Text style={[drum.num, sel && drum.numSel]}>{item}</Text>
              {sel && <Text style={drum.unit}>min</Text>}
            </TouchableOpacity>
          )
        }}
      />
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

export default function HomeScreen({
  profile, onStartFreeRun, onStartBountyRun, onStartTag, onViewPastRun,
}: Props) {
  const insets = useSafeAreaInsets()
  const [mode,             setMode]             = useState<Mode>('Tag')
  const [lobby,            setLobby]            = useState(false)
  const [lobbyCode,        setLobbyCode]        = useState<string | null>(null)
  const [lobbyCreating,    setLobbyCreating]    = useState(false)
  const [lobbyGuest,       setLobbyGuest]       = useState<Profile | null>(null)
  const [showQrModal,      setShowQrModal]      = useState(false)
  const [timeMinutes,      setTimeMinutes]      = useState(10)
  const [players,          setPlayers]          = useState<KnownPlayer[]>([])
  const [tagWL,            setTagWL]            = useState<WLMap>({})
  const [pastRuns,         setPastRuns]         = useState<GhostRun[]>([])
  const [bountyFeed,       setBountyFeed]       = useState<BountyChallenge[]>([])
  const [loading,          setLoading]          = useState(true)
  const [refreshing,       setRefreshing]       = useState(false)
  const [runsExpanded,     setRunsExpanded]     = useState(false)
  const [pendingChallenge, setPendingChallenge] = useState<{ lobbyCode: string; toProfile: Profile } | null>(null)
  const [incomingInvite,   setIncomingInvite]   = useState<{ id: string; fromProfile: Profile; lobbyCode: string } | null>(null)

  const load = useCallback(async () => {
    const uid = profile.id
    const now = new Date().toISOString()

    const [
      { data: tagData },
      { data: friendReqs },
      { data: myRuns },
      { data: bountyData },
      { data: inviteData },
    ] = await Promise.all([
      supabase.from('tag_challenges')
        .select('police_id, thief_id, winner_id')
        .or(`police_id.eq.${uid},thief_id.eq.${uid}`),
      supabase.from('friend_requests')
        .select('*, from_profile:profiles!from_id(*), to_profile:profiles!to_id(*)')
        .or(`from_id.eq.${uid},to_id.eq.${uid}`)
        .eq('status', 'accepted'),
      supabase.from('ghost_runs').select('*').eq('user_id', uid)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('bounty_challenges')
        .select('*, challenger:profiles!challenger_id(*), challenger_run:ghost_runs!challenger_run_id(*)')
        .or(`is_public.eq.true,opponent_id.eq.${uid}`)
        .eq('status', 'pending')
        .gt('expires_at', now)
        .neq('challenger_id', uid)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('tag_invites')
        .select('*, from_profile:profiles!from_id(*)')
        .eq('to_id', uid)
        .eq('status', 'pending')
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    // Build tag W/L map
    const wlMap: WLMap = {}
    for (const tc of (tagData as any[]) ?? []) {
      const otherId: string = tc.police_id === uid ? tc.thief_id : tc.police_id
      const entry = wlMap[otherId] ?? { wins: 0, losses: 0 }
      tc.winner_id === uid ? entry.wins++ : entry.losses++
      wlMap[otherId] = entry
    }
    setTagWL(wlMap)

    // Build friends list from accepted friend requests
    const playerMap = new Map<string, KnownPlayer>()
    for (const req of (friendReqs as any[]) ?? []) {
      const other: Profile = req.from_id === uid ? req.to_profile : req.from_profile
      if (!other) continue
      const wl = wlMap[other.id] ?? { wins: 0, losses: 0 }
      playerMap.set(other.id, { profile: other, wins: wl.wins, losses: wl.losses })
    }
    setPlayers([...playerMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))

    setPastRuns((myRuns as GhostRun[]) ?? [])
    setBountyFeed((bountyData as BountyChallenge[]) ?? [])

    // Surface any pending invite received while offline
    const firstInvite = (inviteData as any[] | null)?.[0]
    if (firstInvite) {
      setIncomingInvite({
        id:          firstInvite.id,
        fromProfile: firstInvite.from_profile as Profile,
        lobbyCode:   firstInvite.lobby_code,
      })
    }

    setLoading(false)
    setRefreshing(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])

  // Watch lobby for guest joining (shared by both direct challenge and group lobby)
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

  // Listen for incoming direct challenges in real-time
  useEffect(() => {
    const channel = supabase
      .channel(`invites-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'tag_invites',
        filter: `to_id=eq.${profile.id}`,
      }, async (payload) => {
        const invite = payload.new as any
        if (invite.status !== 'pending') return
        const { data } = await supabase.from('profiles').select('*').eq('id', invite.from_id).single()
        if (data) {
          setIncomingInvite({ id: invite.id, fromProfile: data as Profile, lobbyCode: invite.lobby_code })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile.id])

  // ── Group lobby ──────────────────────────────────────────────────────────

  async function handleLobbyToggle(on: boolean) {
    if (!on) {
      if (lobbyCode) {
        await supabase.from('lobbies').delete().eq('code', lobbyCode).eq('host_id', profile.id)
      }
      setLobby(false); setLobbyCode(null); setLobbyGuest(null)
      return
    }
    setLobby(true); setLobbyCreating(true)
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    let created = false
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase()
      const { error } = await supabase.from('lobbies').insert({
        host_id: profile.id, code,
        duration_minutes: timeMinutes, expires_at: expiresAt,
      })
      if (!error) { setLobbyCode(code); created = true; break }
      if (error.code !== '23505') break
    }
    if (!created) { setLobby(false); Alert.alert('Error', 'Could not create lobby. Try again.') }
    setLobbyCreating(false)
  }

  // ── Direct 1v1 challenge ─────────────────────────────────────────────────

  async function handleChallengePlayer(opponent: Profile) {
    if (pendingChallenge) {
      Alert.alert('Challenge active', 'Cancel your current challenge before sending a new one.')
      return
    }
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
    let code: string | null = null

    for (let attempt = 0; attempt < 5; attempt++) {
      const c = Math.random().toString(36).slice(2, 8).toUpperCase()
      const { error } = await supabase.from('lobbies').insert({
        host_id: profile.id, code: c,
        duration_minutes: timeMinutes, expires_at: expiresAt,
      })
      if (!error) { code = c; break }
      if (error?.code !== '23505') break
    }

    if (!code) { Alert.alert('Error', 'Could not create challenge. Try again.'); return }

    const { error: inviteErr } = await supabase.from('tag_invites').insert({
      from_id: profile.id, to_id: opponent.id,
      lobby_code: code, expires_at: expiresAt,
    })

    if (inviteErr) {
      await supabase.from('lobbies').delete().eq('code', code)
      Alert.alert('Error', 'Could not send challenge. Try again.')
      return
    }

    setLobbyCode(code)
    setPendingChallenge({ lobbyCode: code, toProfile: opponent })
  }

  async function handleCancelChallenge() {
    if (!pendingChallenge) return
    await supabase.from('lobbies').delete().eq('code', pendingChallenge.lobbyCode).eq('host_id', profile.id)
    await supabase.from('tag_invites').update({ status: 'declined' }).eq('lobby_code', pendingChallenge.lobbyCode)
    setPendingChallenge(null)
    setLobbyCode(null)
    setLobbyGuest(null)
  }

  async function handleAcceptInvite() {
    if (!incomingInvite) return
    await supabase.from('tag_invites').update({ status: 'accepted' }).eq('id', incomingInvite.id)
    await supabase.from('lobbies').update({ guest_id: profile.id })
      .eq('code', incomingInvite.lobbyCode).is('guest_id', null)
    onStartTag({
      lobbyCode:        incomingInvite.lobbyCode,
      myRole:           'thief',
      opponentProfile:  incomingInvite.fromProfile,
      durationMinutes:  timeMinutes,
      headStartMetres:  0,
    })
    setIncomingInvite(null)
  }

  async function handleDeclineInvite() {
    if (!incomingInvite) return
    await supabase.from('tag_invites').update({ status: 'declined' }).eq('id', incomingInvite.id)
    setIncomingInvite(null)
  }

  function handleStartChase() {
    const guest = lobbyGuest
    const code  = pendingChallenge?.lobbyCode ?? lobbyCode
    if (!guest || !code) return
    const headStart = Math.min(500, Math.max(0, (profile.tag_rating - guest.tag_rating) * 0.5))
    onStartTag({
      lobbyCode: code, myRole: 'police', opponentProfile: guest,
      durationMinutes: timeMinutes, headStartMetres: headStart,
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function wlLabel(w: number, l: number) {
    return (
      <Text style={s.wlText}>
        <Text style={[s.wlNum, w > 0 && s.winColor]}>{w}W</Text>
        <Text style={s.wlSep}> / </Text>
        <Text style={[s.wlNum, l > 0 && s.lossColor]}>{l}L</Text>
      </Text>
    )
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const visibleRuns   = runsExpanded ? pastRuns : pastRuns.slice(0, 3)
  const canStartChase = !!lobbyGuest && !!(pendingChallenge?.lobbyCode ?? (lobby && lobbyCode))
  const FOOTER_HEIGHT = mode === 'Tag' ? 172 : mode === 'Ghost' ? 90 : 0

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={C.text} />}
      >
        {/* ── Mode toggle ───────────────────────────────────────────────── */}
        <View style={s.modeToggleWrap}>
          <View style={s.modeToggle}>
            {(['Tag', 'Bounty', 'Ghost'] as Mode[]).map(m => (
              <TouchableOpacity key={m} style={[s.modeTab, mode === m && s.modeTabActive]}
                onPress={() => setMode(m)}>
                <Text style={[s.modeTabText, mode === m && s.modeTabTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── TAG TAB ───────────────────────────────────────────────────── */}
        {mode === 'Tag' && (
          <>
            {/* Incoming challenge banner */}
            {incomingInvite && (
              <View style={s.inviteBanner}>
                <Avatar username={incomingInvite.fromProfile.username} size={40} />
                <View style={s.inviteInfo}>
                  <Text style={s.inviteTitle}>{incomingInvite.fromProfile.username} challenged you</Text>
                  <Text style={s.inviteSub}>Tag · {incomingInvite.fromProfile.tag_rating} rating</Text>
                </View>
                <TouchableOpacity style={s.acceptInviteBtn} onPress={handleAcceptInvite} activeOpacity={0.85}>
                  <Text style={s.acceptInviteText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.declineBtn} onPress={handleDeclineInvite}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Pending outgoing challenge */}
            {pendingChallenge && (
              <View style={s.pendingCard}>
                <View style={s.pendingRow}>
                  <Avatar username={pendingChallenge.toProfile.username} size={40} />
                  <View style={s.pendingInfo}>
                    <Text style={s.pendingTitle}>Challenged {pendingChallenge.toProfile.username}</Text>
                    {lobbyGuest
                      ? <Text style={s.pendingReady}>Accepted — tap Start Chase below</Text>
                      : <Text style={s.pendingSub}>Waiting for them to accept…</Text>
                    }
                  </View>
                  <TouchableOpacity onPress={handleCancelChallenge}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle-outline" size={24} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Friends list */}
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
                      <View key={p.profile.id} style={s.friendRow}>
                        <Avatar username={p.profile.username} size={44} />
                        <View style={s.friendInfo}>
                          <Text style={s.friendName}>{p.profile.username}
                            <Text style={s.friendRating}> ({p.profile.tag_rating})</Text>
                          </Text>
                          {wlLabel(tagWL[p.profile.id]?.wins ?? 0, tagWL[p.profile.id]?.losses ?? 0)}
                        </View>
                        <TouchableOpacity
                          style={[s.challengeBtn, !!pendingChallenge && s.challengeBtnDim]}
                          onPress={() => handleChallengePlayer(p.profile)}
                          disabled={!!pendingChallenge}
                          activeOpacity={0.8}
                        >
                          <Text style={s.challengeBtnText}>Challenge</Text>
                        </TouchableOpacity>
                      </View>
                    ))
              }
            </View>

            {/* Group lobby (secondary / optional) */}
            <View style={s.groupLobbySection}>
              <View style={s.sectionDivider} />
              <View style={s.lobbyRow}>
                <View>
                  <Text style={s.lobbyLabel}>Group Lobby</Text>
                  <Text style={s.lobbySub}>Run club or 3+ players — share a QR code</Text>
                </View>
                {lobbyCreating
                  ? <ActivityIndicator color={C.primary} />
                  : <Switch
                      value={lobby}
                      onValueChange={handleLobbyToggle}
                      disabled={!!pendingChallenge}
                      trackColor={{ false: C.border, true: C.primary }}
                      thumbColor={C.text}
                    />
                }
              </View>

              {lobby && lobbyCode && (
                <>
                  <View style={s.lobbyCard}>
                    <View style={[s.lobbyHalf, s.lobbyHalfPolice]}>
                      <Text style={[s.lobbyRoleLabel, { color: C.red }]}>POLICE</Text>
                      <Avatar username={profile.username} size={44} />
                      <Text style={s.lobbyPlayerName} numberOfLines={1}>{profile.username}</Text>
                      <Text style={s.lobbyRatingText}>({profile.tag_rating})</Text>
                    </View>
                    <View style={s.lobbyDivider} />
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
                  <TouchableOpacity style={s.shareQrBtn} onPress={() => setShowQrModal(true)} activeOpacity={0.8}>
                    <Text style={s.shareQrText}>Share QR</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}

        {/* ── BOUNTY TAB ────────────────────────────────────────────────── */}
        {mode === 'Bounty' && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionTitleRow}>
                <Text style={s.sectionTitle}>OPEN BOUNTIES</Text>
                {bountyFeed.length > 0 && (
                  <View style={s.badge}><Text style={s.badgeText}>{bountyFeed.length}</Text></View>
                )}
              </View>
            </View>
            {loading
              ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
              : bountyFeed.length === 0
                ? (
                  <View style={s.emptyBounty}>
                    <Ionicons name="trophy-outline" size={40} color={C.textMuted} />
                    <Text style={s.empty}>No open bounties yet.</Text>
                    <Text style={s.emptySub}>Finish a Ghost run and post it — the world will hunt it.</Text>
                  </View>
                )
                : bountyFeed.map(bounty => {
                    const run = bounty.challenger_run
                    if (!run) return null
                    const params: BountyParameters = {
                      bountyId:                 bounty.id,
                      challengerUserId:          bounty.challenger_id,
                      opponentUsername:          bounty.challenger?.username ?? 'Unknown',
                      challengeDistanceKm:       run.distance_km,
                      challengeDurationSeconds:  run.duration_s,
                      challengerRun:             run,
                      isPublic:                  bounty.is_public,
                    }
                    const daysLeft = Math.max(0, Math.ceil(
                      (new Date(bounty.expires_at).getTime() - Date.now()) / 86400_000
                    ))
                    return (
                      <View key={bounty.id} style={s.bountyCard}>
                        <View style={s.bountyTop}>
                          <Avatar username={bounty.challenger?.username ?? '?'} size={40} />
                          <View style={s.bountyInfo}>
                            <Text style={s.bountyChallenger}>{bounty.challenger?.username ?? 'Unknown'}</Text>
                            <Text style={s.bountyMeta}>
                              {run.distance_km.toFixed(2)} km · {fmtTime(run.duration_s)} · {fmtPace(run.avg_pace_s_per_km)}
                            </Text>
                            <Text style={s.bountyExpiry}>{daysLeft}d left</Text>
                          </View>
                          <TouchableOpacity style={s.acceptBtn} onPress={() => onStartBountyRun(params)}>
                            <Text style={s.acceptBtnText}>Accept</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )
                  })
            }
          </View>
        )}

        {/* ── GHOST TAB ─────────────────────────────────────────────────── */}
        {mode === 'Ghost' && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={s.sectionTitleRow}>
                <Text style={s.sectionTitle}>MY RUNS</Text>
                {pastRuns.length > 0 && (
                  <View style={s.badge}><Text style={s.badgeText}>{pastRuns.length}</Text></View>
                )}
              </View>
              {pastRuns.length > 3 && (
                <TouchableOpacity onPress={() => setRunsExpanded(v => !v)} style={{ padding: S.xs }}>
                  <Text style={s.viewAll}>{runsExpanded ? 'Show less' : `View all ${pastRuns.length}`}</Text>
                </TouchableOpacity>
              )}
            </View>
            {loading
              ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
              : pastRuns.length === 0
                ? (
                  <View style={s.emptyBounty}>
                    <Ionicons name="footsteps-outline" size={40} color={C.textMuted} />
                    <Text style={s.empty}>No runs yet.</Text>
                    <Text style={s.emptySub}>Hit "Free Run" to record your first run.</Text>
                  </View>
                )
                : visibleRuns.map(run => (
                    <View key={run.id} style={s.runRow}>
                      <View style={s.runIconWrap}>
                        <Ionicons name="timer-outline" size={18} color={C.you} />
                      </View>
                      <View style={s.runInfo}>
                        <Text style={s.runDist}>{run.distance_km.toFixed(2)} km</Text>
                        <Text style={s.runMeta}>{fmtPace(run.avg_pace_s_per_km)} · {formatDate(run.created_at)}</Text>
                      </View>
                      <TouchableOpacity style={s.challengeRunBtn} onPress={() => onViewPastRun(run)}>
                        <Text style={s.challengeRunText}>Challenge</Text>
                      </TouchableOpacity>
                    </View>
                  ))
            }
          </View>
        )}

        <View style={{ height: FOOTER_HEIGHT + insets.bottom }} />
      </ScrollView>

      {/* Fixed footer */}
      {mode !== 'Bounty' && (
        <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
          {mode === 'Tag' && (
            <>
              <Text style={s.footerTimerLabel}>DURATION</Text>
              <TimeDrumPicker value={timeMinutes} onChange={setTimeMinutes} />
              {canStartChase
                ? (
                  <TouchableOpacity style={[s.playBtn, { backgroundColor: C.red }]}
                    onPress={handleStartChase} activeOpacity={0.85}>
                    <Text style={s.playBtnText}>Start Chase</Text>
                  </TouchableOpacity>
                )
                : (
                  <View style={[s.playBtn, s.playBtnInactive]}>
                    <Text style={s.playBtnInactiveText}>
                      {pendingChallenge
                        ? `Waiting for ${pendingChallenge.toProfile.username}…`
                        : 'Challenge a friend above'}
                    </Text>
                  </View>
                )
              }
            </>
          )}
          {mode === 'Ghost' && (
            <TouchableOpacity style={s.playBtn} onPress={onStartFreeRun} activeOpacity={0.85}>
              <Text style={s.playBtnText}>Free Run</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
  root:              { flex: 1, backgroundColor: C.bg },

  // W/L labels
  wlText:            { fontSize: 12 },
  wlNum:             { color: C.textMuted, fontFamily: F.displayBold, fontSize: 14 },
  winColor:          { color: C.green },
  lossColor:         { color: C.red },
  wlSep:             { color: C.textMuted },

  // Mode toggle
  modeToggleWrap:    { paddingHorizontal: S.lg, marginTop: S.md },
  modeToggle:        { flexDirection: 'row', backgroundColor: C.card, borderRadius: R.full, padding: 4 },
  modeTab:           { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: R.full },
  modeTabActive:     { backgroundColor: C.cardDeep },
  modeTabText:       { color: C.textSub, fontSize: 14, fontWeight: '600' },
  modeTabTextActive: { color: C.text },

  // Incoming challenge banner
  inviteBanner:      { flexDirection: 'row', alignItems: 'center', marginHorizontal: S.lg, marginTop: S.md,
                       backgroundColor: 'rgba(255,59,59,0.12)', borderRadius: R.lg, padding: S.md,
                       borderWidth: 1, borderColor: 'rgba(255,59,59,0.35)', gap: S.sm },
  inviteInfo:        { flex: 1 },
  inviteTitle:       { color: C.text, fontSize: 14, fontWeight: '700' },
  inviteSub:         { color: C.textSub, fontSize: 12, marginTop: 2 },
  acceptInviteBtn:   { backgroundColor: C.red, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10 },
  acceptInviteText:  { color: C.text, fontWeight: '700', fontSize: 13 },
  declineBtn:        { padding: 4 },

  // Pending outgoing challenge card
  pendingCard:       { marginHorizontal: S.lg, marginTop: S.md, backgroundColor: C.card, borderRadius: R.lg,
                       padding: S.md, borderWidth: 1, borderColor: C.border },
  pendingRow:        { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  pendingInfo:       { flex: 1 },
  pendingTitle:      { color: C.text, fontSize: 14, fontWeight: '700' },
  pendingReady:      { color: C.green, fontSize: 12, marginTop: 2 },
  pendingSub:        { color: C.textMuted, fontSize: 12, marginTop: 2 },

  // Section
  section:           { paddingHorizontal: S.lg, marginTop: S.md },
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  sectionTitleRow:   { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  sectionTitle:      { color: C.textSub, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  badge:             { backgroundColor: C.card, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:         { color: C.text, fontSize: 11, fontWeight: '700' },
  viewAll:           { color: C.textSub, fontSize: 13 },

  // Friend row
  friendRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: S.sm },
  friendInfo:        { flex: 1 },
  friendName:        { color: C.text, fontSize: 15, fontWeight: '600' },
  friendRating:      { color: C.textSub, fontWeight: '400' },

  // Challenge button on friend row
  challengeBtn:      { backgroundColor: C.red, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10 },
  challengeBtnDim:   { opacity: 0.35 },
  challengeBtnText:  { color: C.text, fontWeight: '700', fontSize: 13 },

  // Group lobby section
  groupLobbySection: { marginTop: S.sm },
  sectionDivider:    { height: 1, backgroundColor: C.border, marginHorizontal: S.lg, marginBottom: S.sm },
  lobbyRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: S.sm },
  lobbyLabel:        { color: C.textSub, fontSize: 14, fontWeight: '600' },
  lobbySub:          { color: C.textMuted, fontSize: 11, marginTop: 2 },
  lobbyCard:         { flexDirection: 'row', marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.lg, overflow: 'hidden', height: 140, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  lobbyHalf:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: S.md },
  lobbyHalfPolice:   { backgroundColor: 'rgba(255,59,59,0.08)' },
  lobbyHalfThief:    { backgroundColor: 'rgba(61,123,255,0.08)' },
  lobbyDivider:      { width: 1, backgroundColor: C.border },
  lobbyRoleLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: F.bodyBold },
  lobbyPlayerName:   { color: C.text, fontSize: 13, fontWeight: '600', maxWidth: 100, textAlign: 'center' },
  lobbyRatingText:   { color: C.textSub, fontSize: 11 },
  lobbyWaiting:      { alignItems: 'center', gap: S.xs },
  lobbyWaitingText:  { color: C.textMuted, fontSize: 12 },
  shareQrBtn:        { marginHorizontal: S.lg, backgroundColor: C.card, borderRadius: R.md, paddingVertical: 14, alignItems: 'center', marginBottom: S.md },
  shareQrText:       { color: C.text, fontWeight: '600', fontSize: 15 },

  // Bounty feed
  bountyCard:        { backgroundColor: C.card, borderRadius: R.md, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.border },
  bountyTop:         { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  bountyInfo:        { flex: 1 },
  bountyChallenger:  { color: C.text, fontSize: 15, fontWeight: '600' },
  bountyMeta:        { color: C.textSub, fontSize: 13, marginTop: 2 },
  bountyExpiry:      { color: C.textMuted, fontSize: 11, marginTop: 2 },
  acceptBtn:         { backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14 },
  acceptBtnText:     { color: C.text, fontWeight: '700', fontSize: 14 },

  // Empty states
  empty:             { color: C.textMuted, fontSize: 14, textAlign: 'center', paddingTop: S.sm },
  emptyBounty:       { alignItems: 'center', paddingVertical: S.xl, gap: S.sm },
  emptySub:          { color: C.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: S.xl },

  // Past runs
  runRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: S.sm },
  runIconWrap:       { width: 40, height: 40, borderRadius: R.md, backgroundColor: C.card, justifyContent: 'center', alignItems: 'center' },
  runInfo:           { flex: 1 },
  runDist:           { color: C.text, fontSize: 15, fontWeight: '600', fontFamily: F.displayBold },
  runMeta:           { color: C.textSub, fontSize: 12, marginTop: 2 },
  challengeRunBtn:   { backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: S.sm, paddingVertical: 12, borderWidth: 1, borderColor: C.border },
  challengeRunText:  { color: C.textSub, fontSize: 12, fontWeight: '600' },

  // Footer
  footer:            { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.bg, paddingHorizontal: S.lg, paddingTop: S.xs, borderTopWidth: 0.5, borderTopColor: C.border },
  footerTimerLabel:  { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 1, textAlign: 'center', marginBottom: 0 },
  playBtn:           { backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 18, alignItems: 'center', marginTop: S.xs },
  playBtnText:       { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.display },
  playBtnInactive:   { backgroundColor: C.cardDeep },
  playBtnInactiveText: { color: C.textMuted, fontSize: 15, fontWeight: '600' },

  // QR Modal
  modalBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:        { backgroundColor: C.card, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: S.xl, alignItems: 'center', gap: S.md },
  modalHandle:       { width: 40, height: 4, backgroundColor: C.border, borderRadius: R.full, marginBottom: S.sm },
  modalTitle:        { color: C.text, fontSize: 18, fontWeight: '700', fontFamily: F.displayBold },
  qrBox:             { backgroundColor: C.cardDeep, borderRadius: R.lg, padding: S.lg },
  lobbyCodeText:     { color: C.text, fontSize: 32, fontFamily: F.display, letterSpacing: 6 },
  lobbyCodeHint:     { color: C.textSub, fontSize: 13 },
  qrShareBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primary, borderRadius: R.full, paddingVertical: 14, paddingHorizontal: S.xl, gap: S.sm, width: '100%', justifyContent: 'center' },
  qrShareBtnText:    { color: C.bg, fontWeight: '700', fontSize: 16, fontFamily: F.displayBold },
  modalClose:        { paddingVertical: S.sm },
  modalCloseText:    { color: C.textSub, fontSize: 15 },
})
