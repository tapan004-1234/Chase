# Chase TODOS

## APNs device token refresh
**Priority:** P2 (before App Store submission)
**What:** App should upsert the push token to `profiles.apns_device_token` on every launch. The `notify-challenge` Edge Function should handle APNs 410 responses by nulling the stale token.
**Why:** Tokens expire on reinstall/iOS upgrade/logout. Stale tokens cause silent notification failures — the friend never sees the challenge with no error shown.
**How to apply (Expo):**
```typescript
// In App.tsx useEffect, after profile loads:
import * as Notifications from 'expo-notifications'
const subscription = Notifications.addPushTokenListener(async ({ data: token }) => {
  await supabase.from('profiles').update({ apns_device_token: token }).eq('id', userId)
})
// Also call on startup:
const token = await Notifications.getExpoPushTokenAsync()
await supabase.from('profiles').update({ apns_device_token: token.data }).eq('id', userId)
```
In the Edge Function, catch `410` from APNs and `UPDATE profiles SET apns_device_token = NULL WHERE id = $userId`.
**Depends on:** Supabase schema (done) + requesting `Notifications.requestPermissionsAsync()` during onboarding

## ELO rating updates
**Priority:** P2 (before public launch)
**What:** After a ghost challenge completes, update `profiles.ghost_rating` for both players and insert a row into `ratings_history`. The `elo.ts` calculation exists in `src/lib/elo.ts` but is never called.
**Why:** All users stay at 1000 forever. The rating shown on Profile/Stats is meaningless until this is wired up.
**How to apply:** In `PostRunScreen.save()`, after updating `ghost_challenges`, call:
```typescript
import { calculateELO } from '../lib/elo'
// Fetch both profiles' current ratings
// Call calculateELO(challengerRating, opponentRating, challengerWon)
// Update both profiles.ghost_rating
// Insert two rows into ratings_history
```
Or move this logic to a Supabase Edge Function triggered by the `ghost_challenges` UPDATE webhook (cleaner — avoids race conditions if both clients save simultaneously).

## GPS live map on ActiveRunScreen
**Priority:** P1 (core experience — blocks final design fidelity)
**What:** Integrate `react-native-maps` (Expo-compatible). Show ghost virtual position and user real GPS position as distinct markers. Trace the user's route as a `Polyline`. Overlay the P/T bar and a bottom-sheet stats panel.
**Why:** The design mockup builds the entire run experience around a live map. Without it, users have no spatial context for where the ghost is relative to them — the duel mechanic loses its visceral feel.
**How to apply:**
```typescript
// Install: npx expo install react-native-maps
// Ghost virtual position (calculate from elapsed time + ghost pace)
const ghostCoord = {
  latitude: startLat + (ghostFrac * latDelta),
  longitude: startLng + (ghostFrac * lngDelta),
}
// Render
<MapView style={{ flex: 1 }} userInterfaceStyle="dark">
  <Marker coordinate={ghostCoord} pinColor={C.red} />
  <Marker coordinate={userCoord} pinColor={C.primary} />
  <Polyline coordinates={gpsPoints} strokeColor={C.primary} strokeWidth={3} />
</MapView>
```
**Depends on:** Location permission flow (T4 in design review tasks), GPS points being stored on RunRecorder state

## Victory Native SVG chart on StatsScreen
**Priority:** P2 (visual quality)
**What:** Replace the current block-bar sparkline in `StatsScreen` with a smooth SVG line chart using `victory-native` + `react-native-svg`. Match the Stats design mockup: smooth blue curve, area fill below the line, y-axis labels.
**Why:** The current `<View>` bar approximation looks like a prototype. Every user who opens Stats sees it. The design shows a proper line chart.
**How to apply:**
```typescript
// Install: npx expo install victory-native react-native-svg
import { VictoryLine, VictoryArea, VictoryChart } from 'victory-native'

<VictoryChart>
  <VictoryArea
    data={ratingHistory.map((h, i) => ({ x: i, y: h.rating }))}
    style={{ data: { fill: '#3D7BFF22', stroke: '#3D7BFF', strokeWidth: 2 } }}
    interpolation="natural"
  />
</VictoryChart>
```
**Depends on:** react-native-svg being installed (check package.json)

## Full accessibility audit (pre-App Store submission)
**Priority:** P2 (required before App Store submission)
**What:** Add `accessibilityRole` and `accessibilityLabel` to every interactive element across all 6 screens. Currently zero elements have labels — the entire app is invisible to VoiceOver.
**Why:** iOS App Store review tests accessibility. An app with no VoiceOver support can be rejected. Every `TouchableOpacity` needs at minimum `accessibilityRole="button"` and a descriptive `accessibilityLabel`.
**Scope:** AuthScreen, HomeScreen, ActiveRunScreen, PostRunScreen, StatsScreen, ProfileScreen — all `TouchableOpacity`, `Switch`, `TextInput`, and `FlatList` interactive items.
**Depends on:** T10 (primary CTAs) should be done first as a template for the pattern
