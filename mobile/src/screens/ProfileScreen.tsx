import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import AddFriendModal from '../components/AddFriendModal'
import { C, F, R, S } from '../theme'
import type { GhostChallenge, Profile } from '../types'

interface Props {
  profile:   Profile
  onSignOut: () => void
}

type HistoryTab = 'Tag' | 'Ghost'

interface Rival {
  id:       string
  username: string
  rating:   number
  wins:     number
  losses:   number
}

interface FriendRequest {
  id:          string
  from_id:     string
  to_id:       string
  status:      'pending' | 'accepted' | 'declined'
  created_at:  string
  from_profile?: Profile
  to_profile?:   Profile
}

export default function ProfileScreen({ profile, onSignOut }: Props) {
  const insets = useSafeAreaInsets()
  const [tab,           setTab]           = useState<HistoryTab>('Ghost')
  const [rivals,        setRivals]        = useState<Rival[]>([])
  const [loading,       setLoading]       = useState(true)
  const [joinDate,      setJoinDate]      = useState('')
  const [totalRuns,     setTotalRuns]     = useState(0)
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

    const { count } = await supabase
      .from('ghost_runs').select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
    setTotalRuns(count ?? 0)

    const { data } = await supabase
      .from('ghost_challenges')
      .select('*, challenger:profiles!challenger_id(*), opponent:profiles!opponent_id(*)')
      .or(`challenger_id.eq.${profile.id},opponent_id.eq.${profile.id}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })

    const map = new Map<string, Rival>()
    for (const c of (data as GhostChallenge[]) ?? []) {
      const other = c.challenger_id === profile.id ? c.opponent : c.challenger
      if (!other) continue
      const r = map.get(other.id) ?? { id: other.id, username: other.username, rating: other.ghost_rating, wins: 0, losses: 0 }
      if (c.winner_id === profile.id) r.wins++
      else r.losses++
      map.set(other.id, r)
    }
    setRivals([...map.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)))

    // Friend requests
    const { data: reqs } = await supabase
      .from('friend_requests')
      .select('*, from_profile:profiles!from_id(*), to_profile:profiles!to_id(*)')
      .or(`from_id.eq.${profile.id},to_id.eq.${profile.id}`)
      .eq('status', 'pending')
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

  function renderRival({ item }: { item: Rival }) {
    const total  = item.wins + item.losses
    const isUp   = item.wins >= item.losses
    return (
      <View style={s.rivalRow}>
        <Avatar username={item.username} size={44} />
        <View style={s.rivalInfo}>
          <Text style={s.rivalName}>{item.username}
            <Text style={s.rivalRating}> ({item.rating})</Text>
          </Text>
          <View style={s.wlRow}>
            <Text style={[s.wlNum, item.wins > 0 && s.win]}>{item.wins}W</Text>
            <Text style={s.wlSep}> / </Text>
            <Text style={[s.wlNum, item.losses > 0 && s.loss]}>{item.losses}L</Text>
            <Text style={s.wlSep}> / 0D</Text>
          </View>
        </View>
        {total > 0 && (
          <View style={[s.resultDot, { backgroundColor: isUp ? C.green : C.red }]} />
        )}
        <Ionicons name="share-outline" size={18} color={C.textSub} style={{ marginLeft: S.sm }} />
      </View>
    )
  }

  return (
    <ScrollView style={[s.root, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
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
        <TouchableOpacity style={s.shareBtn}>
          <Ionicons name="share-outline" size={18} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Rating cards */}
      <View style={s.ratingRow}>
        <View style={s.ratingCard}>
          <Text style={s.ratingMode}>Tag</Text>
          <Ionicons name="body-outline" size={28} color={C.red} style={{ marginVertical: S.xs }} />
          <Text style={s.ratingNum}>{profile.tag_rating}</Text>
        </View>
        <View style={s.ratingCard}>
          <Text style={s.ratingMode}>Ghost</Text>
          <Ionicons name="timer-outline" size={28} color={C.primary} style={{ marginVertical: S.xs }} />
          <Text style={s.ratingNum}>{profile.ghost_rating}</Text>
        </View>
      </View>

      {/* History tab toggle */}
      <View style={s.historyTabs}>
        {(['Tag', 'Ghost'] as HistoryTab[]).map(t => (
          <TouchableOpacity key={t} style={[s.historyTab, tab === t && s.historyTabActive]}
            onPress={() => setTab(t)}>
            <Text style={[s.historyTabText, tab === t && s.historyTabTextActive]}>{t} History</Text>
            {t === 'Ghost' && (
              <View style={s.historyBadge}>
                <Text style={s.historyBadgeText}>{totalRuns}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Rival list */}
      {loading
        ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
        : rivals.length === 0
          ? <Text style={s.empty}>No completed challenges yet.{'\n'}Challenge a friend to start a rivalry.</Text>
          : rivals.map(r => <View key={r.id}>{renderRival({ item: r })}</View>)
      }

      {rivals.length > 0 && (
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
        onClose={() => { setShowAddFriend(false); load() }}
      />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root:             { flex: 1, backgroundColor: C.bg },
  topRow:           { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: S.md, paddingVertical: S.sm },

  identity:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.lg },
  name:             { color: C.text, fontSize: 22, fontWeight: '700', fontFamily: F.bodyBold },
  joined:           { color: C.textSub, fontSize: 13, marginTop: 2 },

  // Friend requests
  requestsSection:  { paddingHorizontal: S.lg, marginBottom: S.md },
  sectionTitle:     { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: S.sm, fontFamily: F.bodyBold },
  requestRow:       { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 8 },
  requestName:      { color: C.text, fontSize: 15, fontWeight: '600' },
  reqBtn:           { borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 14 },
  reqBtnText:       { color: C.text, fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold },

  // Actions
  actionsRow:       { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.lg, gap: S.sm },
  addFriendBtn:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderRadius: R.md, paddingVertical: 15, gap: S.sm },
  addFriendText:    { color: C.text, fontWeight: '600', fontSize: 14 },
  shareBtn:         { backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 15, justifyContent: 'center', alignItems: 'center' },

  // Ratings
  ratingRow:        { flexDirection: 'row', paddingHorizontal: S.lg, gap: S.sm, marginBottom: S.lg },
  ratingCard:       { flex: 1, backgroundColor: C.card, borderRadius: R.lg, padding: S.lg, alignItems: 'center' },
  ratingMode:       { color: C.textSub, fontSize: 13 },
  ratingNum:        { color: C.text, fontSize: 40, fontFamily: F.display },

  // History tabs
  historyTabs:      { flexDirection: 'row', paddingHorizontal: S.lg, marginBottom: S.md },
  historyTab:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: S.md, borderRadius: R.md, marginRight: S.sm, gap: S.xs },
  historyTabActive: { backgroundColor: C.card },
  historyTabText:   { color: C.textMuted, fontSize: 15, fontWeight: '600' },
  historyTabTextActive: { color: C.text },
  historyBadge:     { backgroundColor: C.border, borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 2 },
  historyBadgeText: { color: C.textSub, fontSize: 11, fontWeight: '700', fontFamily: F.bodyBold },

  // Rival rows
  rivalRow:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: 12 },
  rivalInfo:        { flex: 1, marginLeft: S.sm },
  rivalName:        { color: C.text, fontSize: 15, fontWeight: '600' },
  rivalRating:      { color: C.textSub, fontWeight: '400' },
  wlRow:            { flexDirection: 'row', marginTop: 2 },
  wlNum:            { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  win:              { color: C.green },
  loss:             { color: C.red },
  wlSep:            { color: C.textMuted, fontSize: 12 },
  resultDot:        { width: 28, height: 28, borderRadius: 6 },

  viewAllBtn:       { marginHorizontal: S.lg, marginTop: S.md, backgroundColor: C.card, borderRadius: R.md, paddingVertical: 16, alignItems: 'center' },
  viewAllText:      { color: C.text, fontWeight: '600', fontSize: 15 },
  signOutRow:       { paddingVertical: S.lg, alignItems: 'center' },
  signOutText:      { color: C.textMuted, fontSize: 14 },
  empty:            { color: C.textMuted, textAlign: 'center', paddingVertical: S.xl, paddingHorizontal: S.xl, fontSize: 14, lineHeight: 22 },
})
