import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView, Share, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import AddFriendModal from '../components/AddFriendModal'
import { C, F, R, S } from '../theme'
import type { Profile } from '../types'
import { fmtPace } from '../lib/formatters'

interface Props {
  profile:    Profile
  ghostScore: number
  onSignOut:  () => void
}

type HistoryTab = 'Tag' | 'Bounty' | 'Ghost'

interface TagRival {
  id:       string
  username: string
  rating:   number
  wins:     number
  losses:   number
}

interface BountyRival {
  id:       string
  username: string
  rating:   number
  wins:     number
  losses:   number
}

interface GhostRunRow {
  id:                string
  distance_km:       number
  duration_s:        number
  avg_pace_s_per_km: number
  created_at:        string
}

interface FriendRequest {
  id:           string
  from_id:      string
  to_id:        string
  status:       'pending' | 'accepted' | 'declined'
  created_at:   string
  from_profile?: Profile
  to_profile?:   Profile
}

export default function ProfileScreen({ profile, ghostScore, onSignOut }: Props) {
  const insets = useSafeAreaInsets()
  const [tab,           setTab]           = useState<HistoryTab>('Tag')
  const [tagRivals,     setTagRivals]     = useState<TagRival[]>([])
  const [bountyRivals,  setBountyRivals]  = useState<BountyRival[]>([])
  const [ghostRuns,     setGhostRuns]     = useState<GhostRunRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [joinDate,      setJoinDate]      = useState('')
  const [totalTagGames, setTotalTagGames] = useState(0)
  const [totalBounties, setTotalBounties] = useState(0)
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [incoming,      setIncoming]      = useState<FriendRequest[]>([])
  const [outgoing,      setOutgoing]      = useState<FriendRequest[]>([])
  const [responding,    setResponding]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.created_at) {
      const d = new Date(user.created_at)
      setJoinDate(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    }

    const [
      { count: tagCount },
      { count: bountyCount },
      { data: tagData },
      { data: bountyData },
      { data: runsData },
      { data: reqs },
    ] = await Promise.all([
      supabase.from('tag_challenges').select('*', { count: 'exact', head: true })
        .or(`police_id.eq.${profile.id},thief_id.eq.${profile.id}`),

      supabase.from('bounty_challenges').select('*', { count: 'exact', head: true })
        .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
        .eq('status', 'complete'),

      supabase.from('tag_challenges')
        .select('*, police:profiles!police_id(id, username, tag_rating), thief:profiles!thief_id(id, username, tag_rating)')
        .or(`police_id.eq.${profile.id},thief_id.eq.${profile.id}`)
        .order('created_at', { ascending: false }),

      supabase.from('bounty_challenges')
        .select('*, challenger:profiles!challenger_id(id, username, bounty_rating), opponent:profiles!opponent_id(id, username, bounty_rating)')
        .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
        .eq('status', 'complete')
        .order('created_at', { ascending: false }),

      supabase.from('ghost_runs')
        .select('id, distance_km, duration_s, avg_pace_s_per_km, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(30),

      supabase.from('friend_requests')
        .select('*, from_profile:profiles!from_id(*), to_profile:profiles!to_id(*)')
        .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
        .eq('status', 'pending'),
    ])

    setTotalTagGames(tagCount ?? 0)
    setTotalBounties(bountyCount ?? 0)

    // Tag rivals
    const tagMap = new Map<string, TagRival>()
    for (const tc of (tagData as any[]) ?? []) {
      const other: any = tc.police_id === profile.id ? tc.thief : tc.police
      if (!other) continue
      const r = tagMap.get(other.id) ?? { id: other.id, username: other.username, rating: other.tag_rating ?? 1200, wins: 0, losses: 0 }
      if (tc.winner_id === profile.id) r.wins++
      else r.losses++
      tagMap.set(other.id, r)
    }
    setTagRivals([...tagMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))

    // Bounty rivals
    const bountyMap = new Map<string, BountyRival>()
    for (const bc of (bountyData as any[]) ?? []) {
      const iChallenger = bc.challenger_id === profile.id
      const other: any = iChallenger ? bc.opponent : bc.challenger
      if (!other) continue
      const r = bountyMap.get(other.id) ?? { id: other.id, username: other.username, rating: other.bounty_rating ?? 1200, wins: 0, losses: 0 }
      if (bc.winner_id === profile.id) r.wins++
      else r.losses++
      bountyMap.set(other.id, r)
    }
    setBountyRivals([...bountyMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))

    setGhostRuns((runsData ?? []) as GhostRunRow[])

    const allReqs = (reqs as FriendRequest[]) ?? []
    setIncoming(allReqs.filter(r => r.to_id === profile.id))
    setOutgoing(allReqs.filter(r => r.from_id === profile.id))

    setLoading(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])

  async function respondToRequest(reqId: string, accept: boolean) {
    setResponding(reqId)
    await supabase
      .from('friend_requests')
      .update({ status: accept ? 'accepted' : 'declined' })
      .eq('id', reqId)
    setIncoming(prev => prev.filter(r => r.id !== reqId))
    setResponding(null)
  }

  async function cancelRequest(reqId: string) {
    await supabase.from('friend_requests').delete().eq('id', reqId)
    setOutgoing(prev => prev.filter(r => r.id !== reqId))
  }

  function fmtDuration(secs: number) {
    const m = Math.floor(secs / 60), s = secs % 60
    return `${m}m ${s < 10 ? '0' : ''}${s}s`
  }

  function RivalRow({ rival, ratingColor }: { rival: TagRival | BountyRival; ratingColor: string }) {
    const isUp = rival.wins >= rival.losses
    return (
      <View style={s.rivalRow}>
        <Avatar username={rival.username} size={44} />
        <View style={s.rivalInfo}>
          <Text style={s.rivalName}>
            {rival.username}
            <Text style={s.rivalRating}> ({rival.rating})</Text>
          </Text>
          <View style={s.wlRow}>
            <Text style={[s.wlNum, rival.wins > 0 && s.win]}>{rival.wins}W</Text>
            <Text style={s.wlSep}> / </Text>
            <Text style={[s.wlNum, rival.losses > 0 && s.loss]}>{rival.losses}L</Text>
          </View>
        </View>
        <View style={[s.resultDot, { backgroundColor: isUp ? C.green : C.red }]} />
      </View>
    )
  }

  const tabColor: Record<HistoryTab, string> = { Tag: C.red, Bounty: C.primary, Ghost: C.you }
  const activeRivals = tab === 'Tag' ? tagRivals : tab === 'Bounty' ? bountyRivals : []

  return (
    <ScrollView style={[s.root, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.topRow}>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => Alert.alert('Coming soon', 'Profile settings are coming in the next update.')}
          accessibilityRole="button" accessibilityLabel="Profile options">
          <Ionicons name="ellipsis-horizontal" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Identity */}
      <View style={s.identity}>
        <Avatar username={profile.username} size={64} radius={14} />
        <View style={{ marginLeft: S.md }}>
          <Text style={s.name}>{profile.username}</Text>
          {joinDate ? <Text style={s.joined}>Joined {joinDate}</Text> : null}
        </View>
      </View>

      {/* Incoming friend requests */}
      {incoming.length > 0 && (
        <View style={s.requestsSection}>
          <Text style={s.sectionTitle}>FRIEND REQUESTS ({incoming.length})</Text>
          {incoming.map(req => (
            <View key={req.id} style={s.requestRow}>
              <Avatar username={req.from_profile?.username ?? '?'} size={40} />
              <Text style={s.requestName}>{req.from_profile?.username ?? '?'}</Text>
              <TouchableOpacity
                style={[s.reqBtn, { backgroundColor: C.primary }]}
                onPress={() => respondToRequest(req.id, true)}
                disabled={responding === req.id}
              >
                {responding === req.id
                  ? <ActivityIndicator color={C.text} size="small" />
                  : <Text style={s.reqBtnText}>Accept</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.reqBtn, { backgroundColor: C.card }]}
                onPress={() => respondToRequest(req.id, false)}
                disabled={responding === req.id}
              >
                <Text style={[s.reqBtnText, { color: C.textSub }]}>Decline</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Outgoing pending requests */}
      {outgoing.length > 0 && (
        <View style={s.requestsSection}>
          <Text style={s.sectionTitle}>SENT REQUESTS</Text>
          {outgoing.map(req => (
            <View key={req.id} style={s.requestRow}>
              <Avatar username={req.to_profile?.username ?? '?'} size={40} />
              <Text style={[s.requestName, { flex: 1 }]}>{req.to_profile?.username ?? '?'}</Text>
              <TouchableOpacity
                style={[s.reqBtn, { backgroundColor: C.card }]}
                onPress={() => cancelRequest(req.id)}
              >
                <Text style={[s.reqBtnText, { color: C.textSub }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={s.actionsRow}>
        <TouchableOpacity style={s.addFriendBtn} onPress={() => setShowAddFriend(true)}>
          <Ionicons name="person-add-outline" size={16} color={C.text} />
          <Text style={s.addFriendText}>Add Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.shareBtn}
          onPress={() => Share.share({
            message: `Chase me! Ghost ${ghostScore} · Bounty ${profile.bounty_rating} · Tag ${profile.tag_rating}\nChallenge @${profile.username} on Chase.`,
            title: `${profile.username} on Chase`,
          })}
        >
          <Ionicons name="share-outline" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* 3 Rating cards */}
      <View style={s.ratingRow}>
        <View style={s.ratingCard}>
          <Text style={s.ratingMode}>Tag</Text>
          <Ionicons name="body-outline" size={22} color={C.red} style={{ marginVertical: 4 }} />
          <Text style={[s.ratingNum, { color: C.red }]}>{profile.tag_rating}</Text>
        </View>
        <View style={s.ratingCard}>
          <Text style={s.ratingMode}>Bounty</Text>
          <Ionicons name="trophy-outline" size={22} color={C.primary} style={{ marginVertical: 4 }} />
          <Text style={[s.ratingNum, { color: C.primary }]}>{profile.bounty_rating}</Text>
        </View>
        <View style={s.ratingCard}>
          <Text style={s.ratingMode}>Ghost</Text>
          <Ionicons name="flash-outline" size={22} color={C.you} style={{ marginVertical: 4 }} />
          <Text style={[s.ratingNum, { color: C.you }]}>{ghostScore}</Text>
        </View>
      </View>

      {/* History tab toggle */}
      <View style={s.historyTabs}>
        {(['Tag', 'Bounty', 'Ghost'] as HistoryTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.historyTab, tab === t && s.historyTabActive]}
            onPress={() => setTab(t)}>
            <Text style={[s.historyTabText, tab === t && { color: tabColor[t], fontFamily: F.bodyBold }]}>{t}</Text>
            {t === 'Tag' && totalTagGames > 0 && (
              <View style={s.historyBadge}><Text style={s.historyBadgeText}>{totalTagGames}</Text></View>
            )}
            {t === 'Bounty' && totalBounties > 0 && (
              <View style={s.historyBadge}><Text style={s.historyBadgeText}>{totalBounties}</Text></View>
            )}
            {t === 'Ghost' && ghostRuns.length > 0 && (
              <View style={s.historyBadge}><Text style={s.historyBadgeText}>{ghostRuns.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
      ) : tab === 'Ghost' ? (
        ghostRuns.length === 0
          ? <Text style={s.empty}>No runs yet.{'\n'}Complete a free run to start building your Ghost score.</Text>
          : ghostRuns.map(run => (
            <View key={run.id} style={s.runRow}>
              <View style={s.runLeft}>
                <Text style={s.runDist}>{run.distance_km.toFixed(2)} km</Text>
                <Text style={s.runDate}>{new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </View>
              <View style={s.runRight}>
                <Text style={s.runPace}>{fmtPace(run.avg_pace_s_per_km)}</Text>
                <Text style={s.runDuration}>{fmtDuration(run.duration_s)}</Text>
              </View>
            </View>
          ))
      ) : (
        activeRivals.length === 0
          ? <Text style={s.empty}>
              {tab === 'Tag'
                ? 'No tag games yet.\nStart a game from the Home tab.'
                : 'No bounties completed yet.\nAccept a challenge from the Home tab.'}
            </Text>
          : activeRivals.map(r => (
            <RivalRow key={r.id} rival={r} ratingColor={tabColor[tab]} />
          ))
      )}

      {activeRivals.length > 0 && tab !== 'Ghost' && (
        <TouchableOpacity style={s.viewAllBtn}
          onPress={() => Alert.alert('Coming soon', 'Full game history is coming in the next update.')}>
          <Text style={s.viewAllText}>View All Games</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.signOutRow} onPress={onSignOut}>
        <Text style={s.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <View style={{ height: insets.bottom + S.xl }} />

      <AddFriendModal
        visible={showAddFriend}
        myId={profile.id}
        onClose={() => { setShowAddFriend(false); void load() }}
      />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  topRow:           { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.md, paddingVertical: S.sm },

  identity:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.lg },
  name:             { color: C.text, fontSize: 22, fontWeight: '700', fontFamily: F.displayBold },
  joined:           { color: C.textSub, fontSize: 13, marginTop: 2 },

  requestsSection:  { paddingHorizontal: S.lg, marginBottom: S.md },
  sectionTitle:     { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: S.sm, fontFamily: F.bodyBold },
  requestRow:       { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 8 },
  requestName:      { color: C.text, fontSize: 15, fontWeight: '600' },
  reqBtn:           { borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14 },
  reqBtnText:       { color: C.text, fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold },

  actionsRow:       { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.lg, gap: S.sm },
  addFriendBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: R.md, paddingVertical: 15, gap: S.sm },
  addFriendText:    { color: C.text, fontWeight: '600', fontSize: 14 },
  shareBtn:         { backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 15, justifyContent: 'center', alignItems: 'center' },

  ratingRow:        { flexDirection: 'row', paddingHorizontal: S.lg, gap: S.sm, marginBottom: S.lg },
  ratingCard:       { flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: S.md, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  ratingMode:       { color: C.textSub, fontSize: 11 },
  ratingNum:        { color: C.text, fontSize: 28, fontFamily: F.display },

  historyTabs:      { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.md, gap: S.xs },
  historyTab:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: S.sm, borderRadius: R.md, gap: S.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  historyTabActive: { borderColor: 'transparent' },
  historyTabText:   { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  historyBadge:     { backgroundColor: C.border, borderRadius: R.full, paddingHorizontal: 6, paddingVertical: 1 },
  historyBadgeText: { color: C.textSub, fontSize: 10, fontWeight: '700', fontFamily: F.bodyBold },

  rivalRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 },
  rivalInfo:        { flex: 1, marginLeft: S.sm },
  rivalName:        { color: C.text, fontSize: 15, fontWeight: '600' },
  rivalRating:      { color: C.textSub, fontWeight: '400' },
  wlRow:            { flexDirection: 'row', marginTop: 2 },
  wlNum:            { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  win:              { color: C.green },
  loss:             { color: C.red },
  wlSep:            { color: C.textMuted, fontSize: 12 },
  resultDot:        { width: 24, height: 24, borderRadius: 6 },

  runRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  runLeft:          { flex: 1 },
  runDist:          { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
  runDate:          { color: C.textSub, fontSize: 12, marginTop: 2 },
  runRight:         { alignItems: 'flex-end' },
  runPace:          { color: C.you, fontSize: 15, fontFamily: F.bodyBold },
  runDuration:      { color: C.textSub, fontSize: 12, marginTop: 2 },

  viewAllBtn:       { marginHorizontal: S.lg, marginTop: S.md, backgroundColor: C.card, borderRadius: R.md, paddingVertical: 16, alignItems: 'center' },
  viewAllText:      { color: C.text, fontWeight: '600', fontSize: 15 },
  signOutRow:       { paddingVertical: S.lg, alignItems: 'center' },
  signOutText:      { color: C.textMuted, fontSize: 14 },
  empty:            { color: C.textMuted, textAlign: 'center', paddingVertical: S.xl, paddingHorizontal: S.xl, fontSize: 14, lineHeight: 22 },
})
