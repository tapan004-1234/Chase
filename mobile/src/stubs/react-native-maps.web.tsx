import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

const s = StyleSheet.create({
  box: { flex: 1, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  txt: { color: '#555', fontSize: 13 },
})

function MapStub({ style, children }: any) {
  return (
    <View style={[s.box, style]}>
      <Text style={s.txt}>Map (iOS only)</Text>
      {children}
    </View>
  )
}

MapStub.displayName = 'MapView'
export default MapStub
export const Marker    = ({ children }: any) => <>{children}</>
export const Polyline  = () => null
export const PROVIDER_DEFAULT = null
export const PROVIDER_GOOGLE  = null
