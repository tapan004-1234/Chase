import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { C, F, R, S } from '../theme'
import type { Profile } from '../types'

interface Props {
  profile: Profile
  onDone: () => void
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

export default function UsernameScreen({ profile, onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [username, setUsername] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function save() {
    const trimmed = username.trim()
    if (!USERNAME_RE.test(trimmed)) {
      setError('3–20 characters. Letters, numbers, and underscores only.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: e } = await supabase
      .from('profiles')
      .update({ username: trimmed, username_set: true })
      .eq('id', profile.id)
    setLoading(false)
    if (e) {
      setError(e.code === '23505' ? 'Username already taken. Try another one.' : e.message)
      return
    }
    onDone()
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + S.lg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.logoWrap}>
        <Text style={s.logo}>
          <Text style={s.logoC}>C</Text>
          <Text style={s.logoRest}>HASE</Text>
        </Text>
      </View>

      <View style={s.body}>
        <Text style={s.title}>Pick your username</Text>
        <Text style={s.sub}>
          This is how other runners see you in challenges and leaderboards.
        </Text>

        <TextInput
          style={[s.input, error ? s.inputError : null]}
          placeholder="e.g. swift_runner"
          placeholderTextColor={C.textMuted}
          value={username}
          onChangeText={v => { setUsername(v); setError(null) }}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={save}
        />

        <Text style={s.hint}>3–20 characters · letters, numbers, underscores</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={save}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color={C.bg} />
            : <Text style={s.btnText}>Continue</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },

  logoWrap:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo:       { fontFamily: F.display, letterSpacing: 2 },
  logoC:      { fontSize: 72, color: C.primary },
  logoRest:   { fontSize: 72, color: C.text },

  body:       { paddingHorizontal: S.lg },
  title:      { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: S.sm, fontFamily: F.display },
  sub:        { color: C.textMuted, fontSize: 14, marginBottom: S.xl, lineHeight: 20, fontFamily: F.body },

  input:      {
    backgroundColor: C.card, color: C.text, borderRadius: R.md,
    paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: C.border, fontFamily: F.body,
    marginBottom: S.xs,
  },
  inputError: { borderColor: C.red },
  hint:       { color: C.textMuted, fontSize: 12, fontFamily: F.body, marginBottom: S.sm },
  error:      { color: C.red, fontSize: 13, fontFamily: F.body, marginBottom: S.sm },

  btn:        {
    backgroundColor: C.primary, borderRadius: R.full,
    paddingVertical: 16, alignItems: 'center', marginTop: S.md,
  },
  btnDisabled:{ opacity: 0.5 },
  btnText:    { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
})
