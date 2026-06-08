# Design System — Chase

## Product Context
- **What this is:** A competitive running app — "Chess.com for running." Two players, one rivalry, persistent W/L records and ELO ratings per friend.
- **Who it's for:** Street and social runners who want competitive stakes with their friend group. Casual-competitive, peer accountability, trash talk.
- **Space/industry:** Competitive fitness / social gaming. Peers: Strava (segments), Chess.com (ELO/rivalry), Zwift (gamification).
- **Project type:** Mobile app (React Native + Expo, iOS-first)
- **Memorable thing:** "Running is a game, and someone is chasing you." Adrenaline + multiplayer energy. Not a tracker — a duel.

---

## Aesthetic Direction
- **Direction:** Competitive-Game Dark — Underground Arcade
- **Decoration level:** Minimal — the game mechanics ARE the decoration. The red/blue P vs T split, the delta number, the W/L record provide all visual interest. No gradients, no decorative blobs, no rounded-everything.
- **Mood:** Dark, electric, focused. The feeling of lining up at the start of a midnight foot race. Fighting game health bar meets GPS tracker.
- **Design gap exploited:** Every competitive fitness app (Strava, Garmin, Nike) uses warm accent colors (orange, green) on dark, and frames competition as "rank vs. leaderboard." Chase uses a cool blue/red duality and frames competition as a one-on-one duel — visually unique in the space.

---

## Typography

- **Display / Performance Metrics:** `Barlow Condensed` Bold/900 — tall, tight, urgent. Race scoreboard energy. Used for ALL numbers and results: delta metres/seconds, elapsed time, pace, ELO rating, WIN/LOSS titles.
- **Body / UI Labels:** `Geist` 300–700 — clean, technical, readable at a glance. Used for names, labels, navigation, paragraphs, buttons.
- **Loading:** Google Fonts CDN
  ```
  https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&family=Geist:wght@300;400;500;600;700&display=swap
  ```
  For React Native: use `expo-font` to load both families at app startup.

### Type Scale
| Size  | Font             | Weight | Usage |
|-------|------------------|--------|-------|
| 88px  | Barlow Condensed | 900    | ActiveRun hero delta (the main number) |
| 72px  | Barlow Condensed | 900    | App logo wordmark |
| 56px  | Barlow Condensed | 900    | PostRun result title (ESCAPE / BUSTED!) |
| 80px  | Barlow Condensed | 900    | PostRun result number |
| 48px  | Barlow Condensed | 900    | Game state full-screen number |
| 32px  | Barlow Condensed | 700    | Section stat values |
| 24px  | Barlow Condensed | 700    | Card stat values, run summary rows |
| 22px  | Geist            | 700    | Profile username heading |
| 18px  | Barlow Condensed | 700    | Primary button label, stop button |
| 16px  | Geist            | 400–600| Body text, form inputs |
| 15px  | Geist            | 600    | Friend names, rival names, card labels |
| 14px  | Geist            | 400    | Secondary text, tappable links |
| 13px  | Geist            | 500–600| Metadata, friend secondary line |
| 12px  | Geist            | 600    | Rival ratings, small labels |
| 11px  | Geist            | 600    | ALL-CAPS section labels (letter-spacing: 0.1em, text-transform: uppercase) |

---

## Color

- **Approach:** Minimal + semantic — one blue/red primary duality, state colors carry all expressive weight.

### Palette
```
Background:    #0D0D0D   — Cinema black. Deeper than typical dark mode (#1A1A1A).
Surface:       #161616   — Card background, elevated panels.
Surface 2:     #1A1A1A   — Secondary surface, tab bar background.
Border:        #2A2A2A   — Card borders, dividers, separator lines.

Blue / Thief:  #3D7BFF   — Primary accent. Electric, game-like. All "Thief" / player / win states.
Red / Police:  #FF3B3B   — Secondary accent. Urgent. All "Police" / ghost / loss states.
Green / Safe:  #22C55E   — Safe state (ahead of ghost by >100m). Positive outcomes.
Orange / Warn: #F97316   — Warning state (gap ≤100m). Urgency signal.

Text primary:  #FFFFFF
Text secondary:#8B8B8B
Text muted:    #444444
```

### Game State Colors (full-screen backgrounds during ActiveRun)
```
Safe    (delta > +100m):   bg #0D0D0D,   delta text #22C55E
Warning (0m < delta ≤ 100m): bg #1a0e00, delta text #F97316
Danger  (delta ≤ 0m):     bg #FF3B3B (full screen red)
Win result:                bg #3D7BFF (full screen blue)
Loss result:               bg #FF3B3B (full screen red)
```

### Dark Mode Strategy
The app is dark-mode only. No light mode support needed for v1. If implemented in future: reduce saturation by 10–15% on surfaces, keep accent colors identical.

---

## Spacing

- **Base unit:** 8px
- **Density:** Compact — users are mid-run, glancing at screens. Prioritize information density and scanability over generous whitespace.

### Scale
```
2xs:  2px  — icon inner gap, badge padding
xs:   4px  — stacked label gap, tight chip padding
sm:   8px  — default inner padding, icon+text gap (S.sm)
md:   16px — card padding, list row padding (S.md)
lg:   24px — screen horizontal padding (S.lg)
xl:   32px — section top margin (S.xl)
2xl:  48px — large vertical gaps (S.xxl)
3xl:  64px — major section breaks
```

### React Native constants (update `mobile/src/theme.ts`)
```typescript
export const S = {
  xs2: 2, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64
}
```

---

## Layout

- **Approach:** Number-first, data-forward. The hero element on every screen is a large number (delta, rating, time). Everything else is secondary chrome.
- **Grid:** Single-column, full-width. No multi-column layouts on phone screens.
- **Max content width:** Full screen width minus `S.lg` (24px) horizontal padding.
- **Border radius:**
  ```
  sm:   8px   — small badges, pills interior
  md:   12px  — standard cards, buttons
  lg:   16px  — rivalry card, large panels
  full: 9999px — pill buttons, progress bars, dot indicators
  ```

### Key Layout Rules
- **ActiveRun screen:** The delta number (`+143m`) gets minimum 88px and maximum vertical space available. No card wrapper around it — naked on the background color.
- **Rivalry card on HomeScreen:** Full-width, red/blue split halves, 110px height. This is the signature component.
- **P/T progress bar:** Full-width, 28px height, pill shape. Always visible during active ghost run.

---

## Motion

- **Approach:** Intentional — transitions that serve game state comprehension.
- **State transitions (ActiveRun bg color change):** 200ms, ease-in-out. When delta crosses a threshold, background color fades.
- **P/T bar progress:** Animated with `Animated.timing`, 300ms ease-out on each GPS update.
- **PostRun result appear:** No animation — the full-screen color card appears instantly. The impact IS the transition.
- **Tab navigation:** Standard React Navigation defaults (slide on stack, fade on tab).

### Easing
```
Enter:  ease-out   (things appearing)
Exit:   ease-in    (things disappearing)
State:  ease-in-out (color transitions mid-run)
```

### Duration
```
micro:  80ms   — tap feedback, icon color switch
short:  150ms  — button press state
medium: 200ms  — game state color transition
long:   300ms  — P/T bar progress, screen transitions
```

---

## React Native Implementation Notes

### Theme file (`mobile/src/theme.ts`) — update to match this system
```typescript
export const C = {
  // Backgrounds
  bg:          '#0D0D0D',
  surface:     '#161616',
  card:        '#161616',
  cardDeep:    '#1A1A1A',
  border:      '#2A2A2A',

  // Accents
  primary:     '#3D7BFF',   // Blue / Thief
  red:         '#FF3B3B',   // Police / danger / loss
  green:       '#22C55E',   // Safe / win
  orange:      '#F97316',   // Warning
  yellow:      '#EAB308',   // (kept for future use)

  // Text
  text:        '#FFFFFF',
  textSub:     '#8B8B8B',
  textMuted:   '#444444',

  // Game state (full-screen)
  stateBlue:   '#3D7BFF',
  stateRed:    '#FF3B3B',
  stateOrange: '#F97316',
  stateGreen:  '#22C55E',
}

export const R = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 }
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }
```

### Font loading (`mobile/App.tsx`)
```typescript
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
```
Install: `npx expo install @expo-google-fonts/barlow-condensed @expo-google-fonts/geist`

### Display number style (apply consistently)
```typescript
// All performance numbers: time, delta, pace, ELO
const displayNum: TextStyle = {
  fontFamily: 'BarlowCondensed_900Black',
  fontSize: 88,       // hero delta
  letterSpacing: -1,
  lineHeight: 88,
}

// Secondary stats (time, dist, pace on run screen)
const statNum: TextStyle = {
  fontFamily: 'BarlowCondensed_700Bold',
  fontSize: 24,
}
```

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-06 | Aesthetic: Competitive-Game Dark | Differentiates from warm-accent fitness apps; serves "adrenaline + game" brief |
| 2026-06-06 | Primary blue #3D7BFF (not #4B4BF5) | More electric, reads as "game" not "productivity app" |
| 2026-06-06 | Barlow Condensed for all numbers | No fitness app does this; scoreboard energy; instantly game-like |
| 2026-06-06 | Geist for body (not Inter) | Avoids the most overused font in mobile apps; same clean readability |
| 2026-06-06 | Background #0D0D0D (not #1A1A1A) | Cinema black; more cinematic; state colors pop harder against deeper background |
| 2026-06-06 | 88px hero delta on ActiveRun | Readability at running pace; screenshot-worthy; "naked data" layout |
| 2026-06-06 | Decoration: minimal | The P/T bar, red/blue split, and W/L record are the visual interest — no added chrome needed |
| 2026-06-06 | Dark mode only for v1 | Social runners use phones outdoors at dawn/dusk; dark reduces eye strain; simplifies v1 scope |
