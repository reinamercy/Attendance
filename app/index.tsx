import { useRouter } from 'expo-router'
import React from 'react'
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function Landing() {
  const router = useRouter()
  return (
    <View style={s.container}>
      <Image source={require('../assets/cit-logo.png')} style={s.logo} />
      <Text style={s.title}>Welcome</Text>
      <Text style={s.subtitle}>Choose your portal</Text>

      <View style={s.row}>
        <TouchableOpacity style={[s.card, { backgroundColor: '#4e44ce' }]} onPress={() => router.push('/admin/login')}>
          <Text style={s.cardTxt}>Admin / Mentor</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[s.card, { backgroundColor: '#9ca3af' }]} onPress={() => {}}>
          <Text style={s.cardTxt}>Student (coming soon)</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 32,
    backgroundColor: '#fff'
  },
  logo: {
    width: 300,
    height: 170,
    marginBottom: 32,
    resizeMode: 'contain'
  },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#', marginBottom: 28 },
  row: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 },
  card: { paddingVertical: 20, paddingHorizontal: 28, borderRadius: 12, minWidth: 200, marginHorizontal: 8 },
  cardTxt: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 15 }
})
