// ── Design tokens — see DESIGN.md for rationale ───────────────────────────

export const C = {
  // Backgrounds
  bg:          '#0A0A0A',   // cinema black — slight warmth, less pure-digital
  surface:     '#161616',   // card / elevated panel
  card:        '#161616',
  cardDeep:    '#1A1A1A',   // secondary surface, tab bar
  border:      '#2A2A2A',

  // Accents
  primary:     '#3D7BFF',   // blue / Thief / Ghost
  red:         '#FF3B3B',   // Police / danger / loss
  you:         '#C5FF40',   // chartreuse — YOUR pace, YOUR delta, YOUR ELO. Always. Never use for anything else.
  green:       '#22C55E',   // police proximity only (police POV "getting close")
  orange:      '#F97316',
  yellow:      '#EAB308',

  // Text
  text:        '#FFFFFF',
  textSub:     '#8B8B8B',
  textMuted:   '#4A4550',   // violet-grey — shifts palette toward surveillance aesthetic

  // Game state full-screen backgrounds
  stateBlue:   '#3D7BFF',
  stateRed:    '#FF3B3B',
  stateOrange: '#F97316',
  stateGreen:  '#22C55E',
}

export const R = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 }

export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 }

// ── Typography ─────────────────────────────────────────────────────────────
// Loaded via expo-font in App.tsx. Use these constants everywhere.
export const F = {
  display: 'BarlowCondensed_900Black',   // hero numbers, result titles
  displayBold: 'BarlowCondensed_700Bold',// secondary stats, pace, time
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemiBold: 'Geist_600SemiBold',
  bodyBold: 'Geist_700Bold',
}
