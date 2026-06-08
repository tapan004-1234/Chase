import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Modal, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import { C, F, R, S } from '../theme'
import type { Profile } from '../types'

interface Props {
  visible:  boolean
  myId:     string
  onClose:  () => void
}

type RequestState = 'idle' | 'pending' | 'sent' | 'error'

export default function AddFriendModal({ visible, myId, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState<Record<string, RequestState>>({})
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', `${q.trim()}%`)
      .neq('id', myId)
      .limit(10)
    setResults((data as Profile[]) ?? [])
    setLoading(false)
  }, [myId])

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(query), 300)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query, search])

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); setSent({}) }
  }, [visible])

  async function sendRequest(toId: string) {
    setSent(s => ({ ...s, [toId]: 'pending' }))
    const { error } = await supabase
      .from('friend_requests')
      .insert({ from_id: myId, to_id: toId })
    setSent(s => ({ ...s, [toId]: error ? 'error' : 'sent' }))
  }

  function buttonLabel(toId: string): string {
    switch (sent[toId]) {
      case 'pending': return '...'
      case 'sent':    return 'Pending ✓'
      case 'error':   return 'Retry'
      default:        return 'Add'
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={[s.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.header}>
          <Text style={s.title}>Add Friend</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search-outline" size={18} color={C.textMuted} style={s.searchIcon} />
          <TextInput
            style={s.input}
            placeholder="Search by username"
            placeholderTextColor={C.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {loading
          ? <ActivityIndicator color={C.text} style={{ marginTop: S.xl }} />
          : results.length === 0 && query.length >= 2
            ? <Text style={s.empty}>No users found for "{query}"</Text>
            : (
              <FlatList
                data={results}
                keyExtractor={r => r.id}
                contentContainerStyle={s.list}
                renderItem={({ item }) => {
                  const state = sent[item.id] ?? 'idle'
                  const isSent = state === 'sent'
                  return (
                    <View style={s.row}>
                      <Avatar username={item.username} size={44} />
                      <View style={s.info}>
                        <Text style={s.username}>{item.username}</Text>
                        <Text style={s.rating}>{item.ghost_rating} pts</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.addBtn, isSent && s.addBtnSent]}
                        onPress={() => sendRequest(item.id)}
                        disabled={state !== 'idle' && state !== 'error'}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.addBtnText, isSent && s.addBtnTextSent]}>
                          {buttonLabel(item.id)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )
                }}
              />
            )
        }
      </KeyboardAvoidingView>
    </Modal>
  )
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingVertical: S.md },
  title:        { color: C.text, fontSize: 20, fontWeight: '700', fontFamily: F.bodyBold },
  searchRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, marginHorizontal: S.lg, borderRadius: R.md, paddingHorizontal: S.md, marginBottom: S.sm },
  searchIcon:   { marginRight: S.sm },
  input:        { flex: 1, color: C.text, fontSize: 16, paddingVertical: 14, fontFamily: F.body },
  list:         { paddingHorizontal: S.lg, paddingTop: S.sm },
  row:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: S.sm },
  info:         { flex: 1 },
  username:     { color: C.text, fontSize: 15, fontWeight: '600' },
  rating:       { color: C.textSub, fontSize: 13, marginTop: 2 },
  addBtn:       { backgroundColor: C.primary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 11 },
  addBtnSent:   { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  addBtnText:   { color: C.text, fontWeight: '700', fontSize: 14 },
  addBtnTextSent: { color: C.textMuted },
  empty:        { color: C.textMuted, textAlign: 'center', marginTop: S.xl, fontSize: 14, fontFamily: F.body },
})
