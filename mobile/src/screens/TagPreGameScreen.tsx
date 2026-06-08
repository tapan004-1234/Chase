import React, { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import { C, F, R, S } from '../theme'
import type { Lobby, Profile, TagParameters } from '../types'

interface Props {
  lobbyCode:      string
  isHost:         boolean
  durationMinutes: number
  myProfile:      Profile
  onStart:        (params: TagParameters) => void
  onCancel:       () => void
}

// Police = host (pursuer), Thief = guest (runner)
// Head start = max(0, min(500, (police_rating - thief_rating) * 0.5)) metres

export default function TagPreGameScreen({ lobbyCode, isHost, durationMinutes, myProfile, onStart, onCancel }: Props) {
  const insets = useSafeAreaInsets()
  const [lobby,         setLobby]         = useState<Lobby | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [myReady,       setMyReady]       = useState(false)
  const [togglingReady, setTogglingReady] = useState(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    let mounted = true

    // Initial fetch
    supabase
      .from('lobbies')
      .select('*, host:profiles!host_id(*), guest:profiles!guest_id(*)')
      .eq('code', lobbyCode)
      .single()
      .then(({ data }) => {
        if (!mounted) return
        setLobby(data as Lobby)
        setLoading(false)
      })

    // Realtime: watch lobby row for ready-state changes and guest join
    const channel = supabase
      .channel(`lobby-pregame-${lobbyCode}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'lobbies',
        filter: `code=eq.${lobbyCode}`,
      }, async () => {
        // Re-fetch full row with joined profiles
        const { data } = await supabase
          .from('lobbies')
          .select('*, host:profiles!host_id(*), guest:profiles!guest_id(*)')
          .eq('code', lobbyCode)
          .single()
        if (mounted && data) setLobby(data as Lobby)
      })
      .subscribe()

    channelRef.current = channel
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [lobbyCode])

  // Auto-start when both ready and lobby status turns 'active'
  useEffect(() => {
    if (!lobby) return
    if (lobby.status !== 'active') return
    if (!lobby.host || !lobby.guest) return

    const police = lobby.host as Profile
    const thief  = lobby.guest as Profile
    const headStart = Math.min(500, Math.max(0, (police.tag_rating - thief.tag_rating) * 0.5))

    onStart({
      lobbyCode,
      myRole:           isHost ? 'police' : 'thief',
      opponentProfile:  isHost ? thief : police,
      durationMinutes:  lobby.duration_minutes,
      headStartMetres:  headStart,
    })
  }, [lobby?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleReady() {
    if (!lobby) return
    setTogglingReady(true)
    const nextReady = !myReady
    const field = isHost ? 'host_ready' : 'guest_ready'
    await supabase
      .from('lobbies')
      .update({ [field]: nextReady })
      .eq('code', lobbyCode)
    setMyReady(nextReady)
    setTogglingReady(false)
  }

  async function handleStart() {
    if (!lobby) return
    // Host triggers start — set status to 'active'
    await supabase
      .from('lobbies')
      .update({ status: 'active' })
      .eq('code', lobbyCode)
    // The useEffect above will fire and call onStart on both devices
  }

  if (loading || !lobby) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.text} size="large" />
      </View>
    )
  }

  const police    = lobby.host  as Profile | undefined
  const thief     = lobby.guest as Profile | undefined
  const bothReady = lobby.host_ready && lobby.guest_ready

  function headStartMetres(): number {
    if (!police || !thief) return 0
    return Math.min(500, Math.max(0, (police.tag_rating - thief.tag_rating) * 0.5))
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={24} color={C.textSub} />
        </TouchableOpacity>
        <Text style={s.lobbyCodeText}>{lobbyCode}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* P/T bar */}
      <View style={s.ptBar}>
        <View style={[s.ptHalf, { backgroundColor: C.red }]}>
          <Text style={s.ptLabel}>POLICE</Text>
        </View>
        <View style={[s.ptHalf, { backgroundColor: C.primary }]}>
          <Text style={s.ptLabel}>THIEF</Text>
        </View>
      </View>

      <View style={s.content}>
        {/* Stats card */}
        <View style={s.statsCard}>
          <StatRow icon="time-outline" label="Duration" value={`${lobby.duration_minutes} min`} />
          <StatRow icon="navigate-outline" label="Head start" value={`${headStartMetres()} m`} />
          <StatRow icon="people-outline" label="Players" value={`${thief ? 2 : 1} / 2`} />
        </View>

        {/* Police row */}
        <PlayerRow
          role="POLICE"
          color={C.red}
          profile={police}
          isReady={lobby.host_ready}
          isMe={isHost}
          onToggleReady={toggleReady}
          toggling={togglingReady}
        />

        {/* Thief row */}
        <PlayerRow
          role="THIEF"
          color={C.primary}
          profile={thief}
          isReady={lobby.guest_ready}
          isMe={!isHost}
          onToggleReady={toggleReady}
          toggling={togglingReady}
        />

        {/* Waiting for opponent */}
        {!thief && (
          <View style={s.waitingBox}>
            <ActivityIndicator color={C.textSub} size="small" style={{ marginRight: S.sm }} />
            <Text style={s.waitingText}>Waiting for opponent to join…</Text>
          </View>
        )}
      </View>

      {/* Start button — host only, enabled when both ready */}
      {isHost && (
        <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
          <TouchableOpacity
            style={[s.startBtn, (!bothReady || !thief) && s.startBtnDisabled]}
            disabled={!bothReady || !thief}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <Text style={s.startBtnText}>
              {bothReady && thief ? 'Start Chase' : 'Waiting for ready…'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {!isHost && (
        <View style={[s.footer, { paddingBottom: insets.bottom + S.sm }]}>
          <View style={s.waitingStartBox}>
            <Text style={s.waitingStartText}>
              {bothReady ? 'Ready! Waiting for host to start…' : 'Mark yourself ready above'}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

function StatRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={sr.row}>
      <Ionicons name={icon as any} size={16} color={C.textSub} />
      <Text style={sr.label}>{label}</Text>
      <Text style={sr.value}>{value}</Text>
    </View>
  )
}
const sr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 6 },
  label: { flex: 1, color: C.textSub, fontSize: 14 },
  value: { color: C.text, fontSize: 14, fontWeight: '600' },
})

function PlayerRow({
  role, color, profile, isReady, isMe, onToggleReady, toggling,
}: {
  role: 'POLICE' | 'THIEF'
  color: string
  profile: Profile | undefined
  isReady: boolean
  isMe: boolean
  onToggleReady: () => void
  toggling: boolean
}) {
  return (
    <View style={[pr.row, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <Avatar username={profile?.username ?? '?'} size={48} />
      <View style={pr.info}>
        <Text style={pr.roleLabel}>{role}</Text>
        {profile
          ? <Text style={pr.name}>{profile.username}
              <Text style={pr.rating}> ({profile.tag_rating})</Text>
            </Text>
          : <Text style={pr.empty}>Waiting…</Text>
        }
      </View>
      {isMe && profile && (
        <TouchableOpacity
          style={[pr.readyBtn, isReady && pr.readyBtnOn]}
          onPress={onToggleReady}
          disabled={toggling}
          activeOpacity={0.8}
        >
          {toggling
            ? <ActivityIndicator color={C.text} size="small" />
            : <Text style={pr.readyBtnText}>{isReady ? 'Ready' : 'Not Ready'}</Text>
          }
        </TouchableOpacity>
      )}
      {!isMe && profile && (
        <View style={[pr.readyBtn, isReady && pr.readyBtnOn, { opacity: 0.9 }]}>
          <Text style={pr.readyBtnText}>{isReady ? 'Ready' : 'Not Ready'}</Text>
        </View>
      )}
    </View>
  )
}

const pr = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: R.md, padding: S.md, gap: S.md, marginBottom: S.sm },
  info:       { flex: 1 },
  roleLabel:  { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  name:       { color: C.text, fontSize: 16, fontWeight: '600' },
  rating:     { color: C.textSub, fontWeight: '400', fontSize: 14 },
  empty:      { color: C.textMuted, fontSize: 15 },
  readyBtn:   { backgroundColor: C.cardDeep, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10 },
  readyBtnOn: { backgroundColor: C.green },
  readyBtnText:{ color: C.text, fontWeight: '700', fontSize: 13 },
})

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingVertical: S.md },
  lobbyCodeText:{ color: C.textSub, fontSize: 14, fontWeight: '700', letterSpacing: 2 },

  ptBar:        { flexDirection: 'row', height: 28, marginHorizontal: S.lg, borderRadius: R.full, overflow: 'hidden', marginBottom: S.lg },
  ptHalf:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  ptLabel:      { color: C.text, fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  content:      { flex: 1, paddingHorizontal: S.lg },

  statsCard:    { backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: S.md, paddingVertical: S.sm, marginBottom: S.md },

  waitingBox:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: S.md },
  waitingText:  { color: C.textSub, fontSize: 14 },

  footer:       { paddingHorizontal: S.lg, paddingTop: S.sm },
  startBtn:     { backgroundColor: C.red, borderRadius: R.full, paddingVertical: 18, alignItems: 'center' },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.display },
  waitingStartBox:  { backgroundColor: C.card, borderRadius: R.full, paddingVertical: 18, alignItems: 'center' },
  waitingStartText: { color: C.textSub, fontSize: 16 },
})
