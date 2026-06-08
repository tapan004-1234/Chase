# Design System — Chase

## Product Context
- **What this is:** Competitive GPS running game where players race against ghost recordings of friends' past runs in real-time
- **Who it's for:** Competitive runners who treat running as a multiplayer sport, not a solo health activity
- **Space/industry:** Running apps, competitive fitness, location-based gaming
- **Project type:** Mobile app (React Native / Expo, iOS + Android)
- **Modes:** Ghost (race a recorded run) and Tag (real-time Police vs Thief pursuit)

## North Star
> The eerie tension of being right behind your friend's ghost — or having them right behind you.

Every design decision serves this feeling: personal, urgent, slightly uncanny.

---

## Aesthetic Direction
- **Direction:** Tactical Surveillance
- **Decoration level:** Minimal-functional — color and type carry everything. No gradients, no decorative blobs, no icons in colored circles, no purple/violet accents.
- **Mood:** The visual language of real-time tracking software turned into a competition. Like if a pursuit operations center became your running dashboard. The ghost is being tracked. So are you.
- **Dark-only:** No light mode. Dark reduces eye strain during outdoor runs and reinforces the game-like, cinematic feel. `userInterfaceStyle: "dark"` is correct.

---

## Typography

### Fonts
| Role | Family | Weight | Usage |
|------|--------|--------|-------|
| Display / Hero | Barlow Condensed | 900 Black | Pace, distance, time, delta, result titles, full-state text (BUSTED!, ESCAPE) |
| Secondary stats | Barlow Condensed | 700 Bold | W/L records, sub-headings, distance-away labels |
| Body / UI | Geist | 400 Regular | Descriptions, challenge copy, notification text |
| Labels / Buttons | Geist | 600–700 | Section headers, button text, chip labels |
| Data / Tabular | Geist | 400–700 + `tabular-nums` | Live pace, ELO numbers, any value that changes |
| Code (if any) | Geist Mono | 400 | — |

### Loading
Loaded via `@expo-google-fonts/barlow-condensed` and `@expo-google-fonts/geist` in `App.tsx`. Use the constants in `src/theme.ts` (`F.display`, `F.body`, etc.) everywhere — never hardcode font names.

### Scale
| Level | Size | Weight | Font | Usage |
|-------|------|--------|------|-------|
| Hero | 64–80px | 900 | Barlow Condensed | Active run delta, post-run result |
| Title | 48–52px | 900 | Barlow Condensed | Full-state screens (BUSTED!, YOU WON) |
| Stat large | 32–44px | 900 | Barlow Condensed | KM total on stats, ELO rating on profile |
| Stat medium | 24–28px | 900 | Barlow Condensed | Stat cards during run, chart values |
| Secondary | 20–22px | 700 | Barlow Condensed | Sub-stats, pace labels |
| Screen title | 15–17px | 700 | Geist | Screen headers, play button |
| Body | 13–15px | 400–600 | Geist | Friend names, challenge copy, descriptions |
| Label | 10–12px | 700 | Geist | Section titles (ALL CAPS, letterSpacing 1px), badges |
| Caption | 9–11px | 600 | Geist | Chart axis labels, timestamps, units |

### Anti-patterns
- Never use Inter, Roboto, Arial, Helvetica, Open Sans, or system-ui as primary fonts
- Never mix more than two font families on a single screen
- Never animate live data values — pace, distance, delta update instantly with no transition

---

## Color

### Backgrounds & Surfaces
| Token | Hex | Usage |
|-------|-----|-------|
| `C.bg` | `#0A0A0A` | App background — cinema black with slight warmth |
| `C.surface` | `#161616` | Cards, elevated panels |
| `C.card` | `#161616` | Alias for surface |
| `C.cardDeep` | `#1A1A1A` | Tab bar, secondary surfaces, active mode tab |
| `C.border` | `#2A2A2A` | Dividers, card outlines, input borders |

### Semantic Accents
| Token | Hex | Role | Meaning |
|-------|-----|------|---------|
| `C.primary` | `#3D7BFF` | Ghost / Thief / Blue | Opponent data, Thief role identity, primary CTA buttons |
| `C.you` | `#C5FF40` | You / Chartreuse | Your pace, your delta, your ELO change — always |
| `C.red` | `#FF3B3B` | Police / Behind / Loss | Behind state (Ghost), busted (Thief POV), police role, losses |
| `C.orange` | `#F97316` | Warning / Proximity | Ghost closing in (Ghost mode), police closing in (Thief POV Tag mode) |
| `C.green` | `#22C55E` | Win / Getting Close | Win records, police getting close to thief (Police POV Tag mode) |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `C.text` | `#FFFFFF` | Primary text |
| `C.textSub` | `#8B8B8B` | Secondary labels, ratings, sub-info |
| `C.textMuted` | `#4A4550` | Disabled, placeholder, separators — violet-grey tint (not pure neutral grey) |

### Two-Character Color Grammar (Ghost Mode)
Every element in a Ghost mode race belongs to one of two characters:

- **Chartreuse `#C5FF40`** = You. Your pace number, your delta text, your ELO gain, your endpoint dot on the chart. Always.
- **Blue `#3D7BFF`** = The ghost. Their pace, their position bar, their data. Always.

Never reverse this. A runner should know instantly which number is theirs without reading a label.

### Anti-patterns
- Never use purple, violet, or gradient accents as primary color
- Never use green as a generic "success" indicator — in Chase, green is a role-specific proximity color (police POV)
- Never use chartreuse for backgrounds, borders, or decorative elements — reserve it for your own data only
- The muted text uses `#4A4550` (violet-grey), not pure neutral grey — this slight desaturation shifts the palette toward the surveillance aesthetic

---

## Game State Colors

### Ghost Mode — Proximity System
Color communicates proximity to the ghost, not performance quality.

| State | Condition | Background | Delta Text | Overlay Text |
|-------|-----------|------------|------------|--------------|
| Safe | delta > 100m | `C.bg` (#0A0A0A) | `C.you` (#C5FF40) | — |
| Warning | 0m ≤ delta ≤ 100m | `C.orange` (#F97316) full-screen | `C.text` | "GETTING CLOSE" |
| Behind | delta < 0m | `C.red` (#FF3B3B) full-screen | `C.text` | — |

The orange state means "they're RIGHT THERE" — not danger, proximity. The red state means the ghost has passed you — not failure, a fact.

### Tag Mode — Dual-Role System
Same event shows different colors depending on role. Color encodes both identity and outcome.

#### Thief (T) Perspective
| State | Condition | Background | Display |
|-------|-----------|------------|---------|
| Escaping | Police far behind | `C.bg` + chartreuse gap text | Normal dark screen |
| Warning | Police within range | `C.orange` full-screen | "GETTING CLOSE · −Xm" |
| Busted | Police caught you | `C.red` full-screen | "BUSTED! · 0" |

#### Police (P) Perspective
| State | Condition | Background | Display |
|-------|-----------|------------|---------|
| Chasing | Thief far ahead | `C.bg` + chartreuse gap text | Normal dark screen |
| Getting close | Thief within range | `C.green` full-screen | "GETTING CLOSE · +Xm" |
| Caught thief | You tagged them | `C.primary` full-screen | "BUSTED! · 0" |
| Thief escaped | Time expired, thief won | `C.red` full-screen | "ESCAPE · +Xm" |

#### Role-color logic
- **Red** = bad outcome for both roles (busted if Thief, escaped if Police)
- **Blue** = good outcome for both roles (escaped if Thief, caught if Police)
- **Orange** = Thief-specific warning (police closing in)
- **Green** = Police-specific proximity (thief within range)

---

## Spacing

Base unit: **8px**. All spacing is a multiple of 4.

| Token | Value | Usage |
|-------|-------|-------|
| `S.xs` | 4px | Tight gaps, icon-to-text |
| `S.sm` | 8px | Intra-component gaps |
| `S.md` | 16px | Standard padding, screen horizontal margin |
| `S.lg` | 24px | Section gaps, card padding |
| `S.xl` | 32px | Large section spacing |
| `S.xxl` | 48px | Screen-level breathing room |

Screen horizontal padding: `S.lg` (24px) following Apple HIG standard.

---

## Border Radius

Not bubbly, not sharp. Controlled and purposeful.

| Token | Value | Usage |
|-------|-------|-------|
| `R.sm` | 8px | Small elements: avatars, dots, small badges |
| `R.md` | 12px | Buttons, input fields, stat cards during run |
| `R.lg` | 16px | Cards, panels, larger containers |
| `R.xl` | 24px | Modals, bottom sheets |
| `R.full` | 9999px | Pills, toggles, play button, mode tabs |

---

## Layout

- **Approach:** Precision-grid — data-first, strict column discipline. Nothing casual. Every pixel earns its place.
- **Screen margin:** 24px horizontal (Apple HIG `S.lg`)
- **Content max width:** Full-bleed on mobile. No artificial centering.
- **Run screen priority:** Numbers are the hero. The map is a navigation aid, not the centerpiece. Delta and pace should be impossible to miss at a glance while running.
- **Map style:** Dark city grid (`#0E1117` bg, `#141B26` blocks), route drawn as colored polyline (red for ghost route, chartreuse for your route), white/blue position dots with subtle glow rings.
- **P/T bar:** Horizontal split bar below the VS header on run screens. Red = Police progress, Blue = Thief progress. Shows relative position at a glance.

---

## Motion

- **Approach:** Intentional — transitions aid comprehension. Nothing decorative.

| Event | Duration | Easing | Notes |
|-------|----------|--------|-------|
| Game state color change | 80–120ms | instant cut | The snap IS the point. Mimics the moment something crosses you. Do NOT fade. |
| Screen transitions | 150–250ms | ease-out enter, ease-in exit | Standard React Navigation defaults are acceptable |
| Live data updates | 0ms | none | Pace, distance, delta update instantly. Animated live numbers create perceived lag. |
| Drum picker snap | native | `decelerationRate: "fast"` | Mechanical, precise |
| Map route extension | real-time append | none | Trail is a record, not a presentation |

---

## Screen Inventory

### Home Screen
- Recommended match card (VS split box, red/blue halves, opponent info, W/L record)
- Tag / Ghost mode toggle (pill tabs, full-width)
- Create Lobby toggle (switch)
- Friends list (avatar, name, rating, W/L, Challenge button)
- Time selector (horizontal drum-scroll FlatList, `snapToInterval`, selected item shows "min" unit)
- Play button (fixed above tab bar, blue, full-width pill)

### Pre-Game / Lobby Screen
- Player cards with Ready / Not Ready state (green = Ready, blue = Not Ready)
- P/T progress bar
- Stats preview (time elapsed, ghost delta, distance, player count)
- Start button (disabled until both ready)

### Active Run Screen — Ghost Mode
- VS header (opponent username + ghost label)
- Map view (city grid, two route lines, position dots)
- P/T bar (Police red / Thief blue proportional split)
- Stats card: Time Elapsed, vs Ghost delta (chartreuse if ahead), Distance (red), Pace
- Full-screen state color (orange warning, red behind)
- Stop Run button

### Active Run Screen — Tag Mode
- Role chip (THIEF or POLICE label in header)
- Map view (same style)
- P/T bar
- Stats card: Time Elapsed, gap to opponent, Distance Run
- Full-screen state color per role (see Game State table above)
- Stop Run button

### Post-Run Result Screen
- Result header (primary blue background, "YOU WON / YOU LOST", margin at finish)
- Stat grid (Avg Pace, Distance, Duration — 3 column)
- ELO change row (before → `+N · after` in chartreuse)
- Opponent ghost stats card (blue tint)
- Action row: Share (ghost button) + Challenge Again (primary blue, 2× width)

### Stats Screen
- Period filter: underline-active style (not pill). Tabs: 7 days / 30 days / 90 days / 1 year / All Time
- Stat tiles: Tags (red icon) + Ghosts (blue icon), Barlow Condensed 900 count
- History tab toggle: Tag History | Ghost History (pill-active)
- Chart: blue bar columns (low opacity fill) + line sparkline overlay + chartreuse endpoint dot
- KM total: Barlow Condensed 900, large
- Ghost history view: same layout, shows rating over time, current rating in chartreuse

### Profile Screen
- Header: ··· menu (top right)
- Identity: 64×64 avatar (border-radius 14px), username (700 22px), joined date (textSub)
- Action row: Add Friends (full-width-ish, card bg) + Share icon button
- Rating cards: Tag (red icon) | Ghost (blue icon), Barlow Condensed 900 rating number
- History tabs: Tag History + count badge | Ghost History + count badge
- Rival rows: avatar, name (rating), W/L record, result dot (green = winning record, red = losing record vs that opponent), share icon
- View All Games button (card bg, full-width)
- Sign out (textMuted, centered text)

### Auth Screen
- Follows the same dark aesthetic. No decorative elements.

---

## Component Rules

### Buttons
- Primary CTA: `C.primary` background, `R.full` radius, `C.text` label, Geist 700
- Danger: `C.red` background (Stop Run only)
- Your-data accent: `C.you` background, black label (use sparingly — delta indicators, not general CTAs)
- Ghost / Secondary: transparent with `C.border` border
- Never use gradient buttons

### Cards
- Background: `C.surface` (#161616)
- Border: 1px `C.border` (#2A2A2A)
- Radius: `R.lg` (16px) for main cards, `R.md` (12px) for inline stat cards

### Section Headers (ALL CAPS labels)
- Font: Geist 700, 10–11px, `letterSpacing: 1px`, `textTransform: uppercase`
- Color: `C.textSub` (#8B8B8B)
- Never use them for navigation — labels only

### Badges / Pills
- Round pill (`R.full`) with low-opacity background tinted to the semantic color
- Win: `rgba(34, 197, 94, 0.15)` bg, `C.green` text
- Loss: `rgba(255, 59, 59, 0.15)` bg, `C.red` text
- Ghost: `rgba(61, 123, 255, 0.15)` bg, `C.primary` text
- Delta (you): `rgba(197, 255, 64, 0.15)` bg, `C.you` text

### Input Fields
- Background: `C.card`, border: 1px `C.border`, radius: `R.md`
- Focused border: `C.primary`
- Font: Geist 400, 13–14px
- Label above: Geist 600 11px, `C.textSub`

### Tab Bar (Bottom Navigation)
- Background: `C.bg` with top border `C.border`
- Active tab: `C.text` label weight 700
- Inactive tab: `C.textSub`
- Three tabs: Home / Stats / Profile (username)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-07 | Aesthetic direction: Tactical Surveillance | Running as tracking/pursuit, not as wellness. Serves the ghost/tag game mechanics. |
| 2026-06-07 | Dark-only, no light mode | Outdoor visibility, game feel, `userInterfaceStyle: "dark"` already set. |
| 2026-06-07 | Barlow Condensed 900 for hero numbers | Speed, compression, authority. Speedometer energy at 5:42/km. |
| 2026-06-07 | Geist for body/UI | Clean, slightly monospace-adjacent, HUD-native. Legible at 13px. |
| 2026-06-07 | Chartreuse #C5FF40 as "you" accent | Replaces generic green as an identity indicator, not a success indicator. Distinctive — nothing else in fitness uses it. Reserved for your data only. |
| 2026-06-07 | Blue #3D7BFF stays as ghost/thief accent | Already established in codebase. Coherent with the thief/police metaphor (Thief = blue). |
| 2026-06-07 | Muted text: #4A4550 (violet-grey) | Slight desaturation shifts the palette toward the cinematic/surveillance feel vs pure neutral grey. |
| 2026-06-07 | Background: #0A0A0A (vs #0D0D0D) | Slight warmth added — less pure-digital, more analog. Imperceptible difference on most screens but correct for the aesthetic. |
| 2026-06-07 | Game state transitions: 80–120ms cut, not fade | The snap mimics the moment something crosses you. Fading would soften the urgency. |
| 2026-06-07 | Tag mode dual-role color system | Red = bad for both, blue = win for both, orange/green are role-specific proximity. Symmetric grammar that works for either player without confusion. |
| 2026-06-07 | Stats chart: chartreuse endpoint dot on sparkline | Your current position on the rating chart is in your color. Consistent with the two-character grammar. |
| 2026-06-07 | Profile rival result dot (green/red square) | Green = winning record vs that opponent, red = losing. Glanceable without reading W/L numbers. |
