import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal, ScrollView, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase } from '../lib/supabase'
import { C, F, R, S } from '../theme'

// Required for the OAuth browser session to close properly on return
WebBrowser.maybeCompleteAuthSession()

interface Props { onAuth: () => void }

// The redirect URL Supabase sends the user back to after OAuth.
// In Expo Go dev: exp://192.168.x.x:8081/--/
// In a standalone build: your custom scheme (e.g. chase://)
const REDIRECT_URI = makeRedirectUri()
// eslint-disable-next-line no-console
console.log('[Chase] OAuth redirect URI:', REDIRECT_URI)

async function createSessionFromUrl(url: string) {
  // Check for OAuth error first (works for both PKCE and implicit flows)
  const raw = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? ''
  const params = new URLSearchParams(raw)
  const errorCode = params.get('error')
  if (errorCode) throw new Error(params.get('error_description') ?? errorCode)

  // Supabase v2 uses PKCE by default: callback URL contains ?code=
  // exchangeCodeForSession handles both PKCE (code param) and implicit (#access_token)
  const { error } = await supabase.auth.exchangeCodeForSession(url)
  if (error) throw error
}

export default function AuthScreen({ onAuth }: Props) {
  const insets = useSafeAreaInsets()
  const [showEmail, setShowEmail] = useState(false)
  const [isSignIn,  setIsSignIn]  = useState(false)
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [loading,   setLoading]   = useState<'google' | 'apple' | 'email' | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  // ── OAuth (Google / Apple) ─────────────────────────────────────────────
  async function signInWithOAuth(provider: 'google' | 'apple') {
    setLoading(provider); setError(null)
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: REDIRECT_URI,
          skipBrowserRedirect: true,
        },
      })
      if (oauthError) throw oauthError
      if (!data?.url) throw new Error('No OAuth URL returned')

      const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_URI)

      if (result.type === 'success' && result.url) {
        await createSessionFromUrl(result.url)
        // onAuth() is called automatically via supabase.auth.onAuthStateChange in App.tsx
      } else if (result.type === 'cancel') {
        // User dismissed — no-op
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Sign in failed'
      // Surface a useful hint for the common setup-not-done case
      if (msg.toLowerCase().includes('provider') || msg.toLowerCase().includes('not enabled')) {
        Alert.alert(
          `${provider === 'google' ? 'Google' : 'Apple'} Sign In not configured`,
          `Enable the ${provider} provider in your Supabase dashboard under Authentication → Providers, then add your redirect URL.`,
        )
      } else {
        setError(msg)
      }
    } finally {
      setLoading(null)
    }
  }

  // ── Email / password ───────────────────────────────────────────────────
  async function submitEmail() {
    if (!email.trim() || !password) { setError('Email and password are required'); return }
    setLoading('email'); setError(null)
    const { error: e } = isSignIn
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password })
    setLoading(null)
    if (e) { setError(e.message); return }
    setShowEmail(false)
    if (!isSignIn) {
      Alert.alert('Check your email', 'We sent you a confirmation link. Click it to activate your account.')
    }
  }

  const busy = loading !== null

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + S.lg }]}>

      {/* Logo */}
      <View style={s.logoWrap}>
        <Text style={s.logo}>
          <Text style={s.logoC}>C</Text>
          <Text style={s.logoRest}>HASE</Text>
        </Text>
        <Text style={s.tagline}>Running is a game.{'\n'}Someone is chasing you.</Text>
      </View>

      {/* Auth options */}
      <View style={s.buttons}>
        <Text style={s.heading}>Create an account</Text>

        {/* Apple */}
        <TouchableOpacity
          style={[s.ssoBtn, busy && s.ssoBtnDisabled]}
          activeOpacity={0.7}
          disabled={busy}
          onPress={() => signInWithOAuth('apple')}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
        >
          {loading === 'apple'
            ? <ActivityIndicator color={C.text} style={s.ssoIcon} />
            : <Ionicons name="logo-apple" size={20} color={C.text} style={s.ssoIcon} />
          }
          <Text style={s.ssoBtnText}>Continue with Apple</Text>
        </TouchableOpacity>

        {/* Google */}
        <TouchableOpacity
          style={[s.ssoBtn, busy && s.ssoBtnDisabled]}
          activeOpacity={0.7}
          disabled={busy}
          onPress={() => signInWithOAuth('google')}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
        >
          {loading === 'google'
            ? <ActivityIndicator color={C.text} style={s.ssoIcon} />
            : <Text style={[s.googleG, s.ssoIcon]}>G</Text>
          }
          <Text style={s.ssoBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        {/* Email */}
        <TouchableOpacity
          style={[s.ssoBtn, busy && s.ssoBtnDisabled]}
          activeOpacity={0.7}
          disabled={busy}
          onPress={() => { setIsSignIn(false); setShowEmail(true) }}
          accessibilityRole="button"
          accessibilityLabel="Continue with Email"
        >
          <Ionicons name="mail-outline" size={20} color={C.text} style={s.ssoIcon} />
          <Text style={s.ssoBtnText}>Continue with Email</Text>
        </TouchableOpacity>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity onPress={() => { setIsSignIn(true); setShowEmail(true) }} disabled={busy}
          hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}>
          <Text style={s.signinRow}>
            Already have an account?{'  '}
            <Text style={s.signinLink}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>

      {/* Email / password sheet */}
      <Modal visible={showEmail} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={s.modal}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={s.modalInner}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity onPress={() => { setShowEmail(false); setError(null) }} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>

            <Text style={s.modalTitle}>{isSignIn ? 'Sign in' : 'Create account'}</Text>

            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={C.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={s.input}
              placeholder="Password"
              placeholderTextColor={C.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
            />

            {error ? <Text style={s.error}>{error}</Text> : null}

            <TouchableOpacity style={s.submitBtn} onPress={submitEmail} disabled={loading === 'email'}>
              {loading === 'email'
                ? <ActivityIndicator color={C.bg} />
                : <Text style={s.submitText}>{isSignIn ? 'Sign In' : 'Create Account'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setIsSignIn(v => !v); setError(null) }}>
              <Text style={s.switchMode}>
                {isSignIn ? "Don't have an account? " : 'Already have an account? '}
                <Text style={s.signinLink}>{isSignIn ? 'Sign up' : 'Sign in'}</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },

  // Logo
  logoWrap:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: S.md },
  logo:           { fontFamily: F.display, letterSpacing: 2 },
  logoC:          { fontSize: 72, color: C.primary },
  logoRest:       { fontSize: 72, color: C.text },
  tagline:        { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: F.body },

  // Buttons
  buttons:        { paddingHorizontal: S.lg, gap: S.md },
  heading:        { color: C.text, fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: S.sm, fontFamily: F.bodyBold },
  ssoBtn:         {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: R.full,
    paddingVertical: 16, paddingHorizontal: S.lg,
    backgroundColor: C.cardDeep,
  },
  ssoBtnDisabled: { opacity: 0.5 },
  ssoIcon:        { position: 'absolute', left: S.lg },
  googleG:        { color: C.primary, fontSize: 18, fontWeight: '700' },
  ssoBtnText:     { color: C.text, fontSize: 16, fontWeight: '600', fontFamily: F.bodySemiBold },
  error:          { color: C.red, fontSize: 13, textAlign: 'center', fontFamily: F.body },
  signinRow:      { color: C.textSub, textAlign: 'center', fontSize: 14, marginTop: S.sm, fontFamily: F.body },
  signinLink:     { color: C.primary, fontWeight: '600' },

  // Modal
  modal:          { flex: 1, backgroundColor: C.bg },
  modalInner:     { padding: S.lg, paddingTop: S.xl },
  closeBtn:       { alignSelf: 'flex-start', marginBottom: S.lg, padding: 10 },
  modalTitle:     { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: S.xl, fontFamily: F.bodyBold },
  input:          {
    backgroundColor: C.card, color: C.text, borderRadius: R.md,
    paddingHorizontal: S.md, paddingVertical: 14, fontSize: 16,
    marginBottom: S.sm, borderWidth: 1, borderColor: C.border,
    fontFamily: F.body,
  },
  submitBtn:      {
    backgroundColor: C.primary, borderRadius: R.full,
    paddingVertical: 16, alignItems: 'center', marginTop: S.md,
  },
  submitText:     { color: C.text, fontSize: 16, fontWeight: '700', fontFamily: F.bodyBold },
  switchMode:     { color: C.textSub, textAlign: 'center', marginTop: S.lg, fontSize: 14, fontFamily: F.body },
})
