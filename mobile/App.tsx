import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFonts } from 'expo-font'
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_900Black,
} from '@expo-google-fonts/barlow-condensed'
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist'
import * as Notifications from 'expo-notifications'

import { supabase } from './src/lib/supabase'
import { C } from './src/theme'
import type { GhostChallenge, GhostParameters, GhostRun, Profile, RunRecord, TagParameters } from './src/types'

import AuthScreen        from './src/screens/AuthScreen'
import HomeScreen        from './src/screens/HomeScreen'
import StatsScreen       from './src/screens/StatsScreen'
import ProfileScreen     from './src/screens/ProfileScreen'
import ActiveRunScreen   from './src/screens/ActiveRunScreen'
import PostRunScreen     from './src/screens/PostRunScreen'
import TagPreGameScreen  from './src/screens/TagPreGameScreen'
import TagActiveRunScreen from './src/screens/TagActiveRunScreen'

// ── Navigator param types ──────────────────────────────────────────────────

type HomeStackParams = {
  Home:         undefined
  ActiveRun:    { ghost?: GhostParameters }
  PostRun:      { record: RunRecord; ghost?: GhostParameters; alreadySavedRunId?: string }
  TagPreGame:   { lobbyCode: string; isHost: boolean; durationMinutes: number }
  TagActiveRun: { params: TagParameters }
}

// ── Push notification setup ────────────────────────────────────────────────

async function registerPushToken(userId: string) {
  // APNs only works on physical iOS devices
  if (Platform.OS !== 'ios') return
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    const { status } = existing !== 'granted'
      ? await Notifications.requestPermissionsAsync()
      : { status: existing }
    if (status !== 'granted') return

    const token = await Notifications.getDevicePushTokenAsync()
    if (token.type === 'ios' && token.data) {
      await supabase.from('profiles').update({ apns_device_token: token.data }).eq('id', userId)
    }
  } catch {
    // Simulator or entitlement missing — non-fatal
  }
}
type RootTabParams = {
  HomeTab:    undefined
  StatsTab:   undefined
  ProfileTab: undefined
}

const HomeStack = createNativeStackNavigator<HomeStackParams>()
const Tab       = createBottomTabNavigator<RootTabParams>()

// ── Home stack (Home → ActiveRun → PostRun) ────────────────────────────────

function HomeStackNavigator({
  profile,
  onProfileRefresh,
}: {
  profile: Profile
  onProfileRefresh: () => void
}) {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home">
        {({ navigation }) => (
          <HomeScreen
            profile={profile}
            onStartFreeRun={() => navigation.navigate('ActiveRun', {})}
            onAcceptChallenge={(c: GhostChallenge) => {
              if (!c.challenger_run) {
                Alert.alert('Error', 'Challenge run data missing.')
                return
              }
              navigation.navigate('ActiveRun', {
                ghost: {
                  challengeId:              c.id,
                  challengerUserId:         c.challenger_id,
                  challengeDistanceKm:      c.challenger_run.distance_km,
                  challengeDurationSeconds: c.challenger_run.duration_s,
                  opponentUsername:         c.challenger?.username ?? 'Opponent',
                },
              })
            }}
            onChallengeFriend={async (friend: Profile, latestRun: GhostRun | null) => {
              if (!latestRun) {
                Alert.alert('No run yet', 'Record a run first, then challenge a friend with it.')
                return
              }
              const { data: { user } } = await supabase.auth.getUser()
              if (!user) return
              const expires = new Date(Date.now() + 7 * 86400_000).toISOString()
              const { error } = await supabase.from('ghost_challenges').insert({
                challenger_id:     user.id,
                opponent_id:       friend.id,
                challenger_run_id: latestRun.id,
                expires_at:        expires,
              })
              if (error) Alert.alert('Error', error.message)
              else Alert.alert('Challenge sent!', `${friend.username} has been challenged.`)
            }}
            onStartTag={(tagParams: TagParameters) =>
              navigation.navigate('TagPreGame', {
                lobbyCode:       tagParams.lobbyCode,
                isHost:          tagParams.myRole === 'police',
                durationMinutes: tagParams.durationMinutes,
              })
            }
            onViewPastRun={(run) =>
              navigation.navigate('PostRun', {
                record: {
                  distanceKm:          run.distance_km,
                  durationSeconds:     run.duration_s,
                  avgPaceSecondsPerKm: run.avg_pace_s_per_km,
                  gpsPoints:           [],
                  startedAt:           run.created_at,
                  endedAt:             run.created_at,
                },
                alreadySavedRunId: run.id,
              })
            }
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="ActiveRun">
        {({ route, navigation }) => (
          <ActiveRunScreen
            ghost={route.params?.ghost}
            onBack={() => navigation.goBack()}
            onRunComplete={(record: RunRecord) =>
              navigation.replace('PostRun', { record, ghost: route.params?.ghost })
            }
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="PostRun">
        {({ route, navigation }) => (
          <PostRunScreen
            record={route.params.record}
            ghost={route.params.ghost}
            alreadySavedRunId={route.params.alreadySavedRunId}
            onDone={() => {
              onProfileRefresh()
              navigation.navigate('Home')
            }}
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="TagPreGame">
        {({ route, navigation }) => (
          <TagPreGameScreen
            lobbyCode={route.params.lobbyCode}
            isHost={route.params.isHost}
            durationMinutes={route.params.durationMinutes}
            myProfile={profile}
            onStart={(tagParams: TagParameters) =>
              navigation.replace('TagActiveRun', { params: tagParams })
            }
            onCancel={() => navigation.goBack()}
          />
        )}
      </HomeStack.Screen>

      <HomeStack.Screen name="TagActiveRun">
        {({ route, navigation }) => (
          <TagActiveRunScreen
            params={route.params.params}
            onEnd={(_outcome) => navigation.navigate('Home')}
            onCancel={() => navigation.navigate('Home')}
          />
        )}
      </HomeStack.Screen>
    </HomeStack.Navigator>
  )
}

// ── Tab navigator ──────────────────────────────────────────────────────────

function MainTabs({
  profile,
  onSignOut,
  onProfileRefresh,
}: {
  profile: Profile
  onSignOut: () => void
  onProfileRefresh: () => void
}) {
  const [pendingCount, setPendingCount] = useState(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    let active = true

    // Initial count
    supabase
      .from('friend_requests')
      .select('*', { count: 'exact', head: true })
      .eq('to_id', profile.id)
      .eq('status', 'pending')
      .then(({ count }) => { if (active) setPendingCount(count ?? 0) })

    // Realtime subscription
    const channel = supabase
      .channel(`friend-badge-${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'friend_requests',
        filter: `to_id=eq.${profile.id}`,
      }, payload => {
        if ((payload.new as any).status === 'pending') {
          setPendingCount(n => n + 1)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'friend_requests',
        filter: `to_id=eq.${profile.id}`,
      }, payload => {
        const wasP = (payload.old as any).status === 'pending'
        const nowP = (payload.new as any).status === 'pending'
        if (wasP && !nowP) setPendingCount(n => Math.max(0, n - 1))
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [profile.id])

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1A1A1A',
          borderTopColor:  C.border,
          borderTopWidth:  0.5,
          height:          49 + insets.bottom,
          paddingBottom:   insets.bottom + 4,
          paddingTop:      6,
        },
        tabBarActiveTintColor:   C.text,
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle:        { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            HomeTab:    ['home',        'home-outline'],
            StatsTab:   ['stats-chart', 'stats-chart-outline'],
            ProfileTab: ['person',      'person-outline'],
          }
          const [active, inactive] = icons[route.name] ?? ['help', 'help']
          return <Ionicons name={(focused ? active : inactive) as any} size={22} color={color} />
        },
      })}
    >
      <Tab.Screen name="HomeTab" options={{ tabBarLabel: 'Home' }}>
        {() => <HomeStackNavigator profile={profile} onProfileRefresh={onProfileRefresh} />}
      </Tab.Screen>

      <Tab.Screen name="StatsTab" options={{ tabBarLabel: 'Stats' }}>
        {() => <StatsScreen profile={profile} />}
      </Tab.Screen>

      <Tab.Screen name="ProfileTab" options={{
        tabBarLabel: profile.username,
        tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
      }}>
        {() => <ProfileScreen profile={profile} onSignOut={onSignOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_900Black,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  })

  const [ready,        setReady]        = useState(false)
  const [session,      setSession]      = useState(false)
  const [profile,      setProfile]      = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  // Guard against concurrent loadProfile calls (getSession + onAuthStateChange both fire on startup)
  const profileLoading = React.useRef(false)

  async function loadProfile(userId: string) {
    if (profileLoading.current) return
    profileLoading.current = true
    setProfileError(null)

    try {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', userId).single()

      if (data) {
        setProfile(data as Profile)
        registerPushToken(userId)
        return
      }

      // PGRST116 = row not found — trigger may not have run, create the profile
      if (error?.code === 'PGRST116') {
        const { data: authData } = await supabase.auth.getUser()
        const email    = authData?.user?.email ?? ''
        const username = email.split('@')[0] || `runner_${userId.slice(0, 6)}`
        const { data: created, error: insertErr } = await supabase
          .from('profiles').insert({ id: userId, username }).select().single()
        if (created) { setProfile(created as Profile); return }
        setProfileError(insertErr?.message ?? 'Could not create profile')
        return
      }

      // Table doesn't exist → migration not applied
      const msg = error?.code === '42P01'
        ? 'Database not set up. Apply supabase/migrations/001_initial.sql in your Supabase SQL editor.'
        : (error?.message ?? 'Could not load profile')
      setProfileError(msg)
    } catch (e: any) {
      setProfileError(e?.message ?? 'Unexpected error loading profile')
    } finally {
      profileLoading.current = false
    }
  }

  useEffect(() => {
    let mounted = true

    // getSession → initial state + kicks off loadProfile once
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const user = data.session?.user
      if (user) { setSession(true); loadProfile(user.id) }
      else setSession(false)
      setReady(true)
    }).catch(() => {
      if (mounted) setReady(true)   // don't hang if getSession errors
    })

    // onAuthStateChange → handles sign-in / sign-out AFTER initial load.
    // Skip INITIAL_SESSION — getSession above already handles it.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION') return
      if (s?.user) {
        setSession(true)
        profileLoading.current = false  // allow reload on new sign-in
        loadProfile(s.user.id)
      } else {
        setSession(false)
        setProfile(null)
        setProfileError(null)
        profileLoading.current = false
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const handleProfileRefresh = useCallback(() => {
    if (profile?.id) {
      profileLoading.current = false  // allow re-fetch
      loadProfile(profile.id)
    }
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!fontsLoaded || !ready || (session && !profile && !profileError)) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.text} size="large" />
        </View>
      </SafeAreaProvider>
    )
  }

  if (profileError) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ color: C.red, fontSize: 16, textAlign: 'center', marginBottom: 24 }}>
            {profileError}
          </Text>
          <TouchableOpacity
            onPress={() => supabase.auth.signOut()}
            style={{ backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
          >
            <Text style={{ color: C.text }}>Sign out and retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        {!session
          ? <AuthScreen onAuth={() => {}} />
          : <MainTabs profile={profile!} onSignOut={handleSignOut} onProfileRefresh={handleProfileRefresh} />
        }
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
