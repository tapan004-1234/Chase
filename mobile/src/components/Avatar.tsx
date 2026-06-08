import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { F } from '../theme'

interface Props {
  username: string
  size?:    number
  radius?:  number
}

const PALETTE = ['#4B4BF5', '#EF4444', '#22C55E', '#F97316', '#8B5CF6', '#EC4899', '#06B6D4']

function bgColor(username: string): string {
  let h = 0
  for (let i = 0; i < username.length; i++) h = username.charCodeAt(i) + ((h << 5) - h)
  return PALETTE[Math.abs(h) % PALETTE.length]
}

export default function Avatar({ username, size = 44, radius = 10 }: Props) {
  const initial = (username?.[0] ?? '?').toUpperCase()
  return (
    <View style={[s.root, { width: size, height: size, borderRadius: radius, backgroundColor: bgColor(username ?? '') }]}>
      <Text style={[s.letter, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root:   { justifyContent: 'center', alignItems: 'center' },
  letter: { color: '#fff', fontWeight: '700', fontFamily: F.bodyBold },
})
