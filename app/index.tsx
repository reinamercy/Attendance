import { useRouter } from 'expo-router'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function Landing() {
  const router = useRouter()
  return (
    <View style={s.container}>
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
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', color: '#555', marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  card: { paddingVertical: 18, paddingHorizontal: 16, borderRadius: 10, minWidth: 150 },
  cardTxt: { color: '#fff', textAlign: 'center', fontWeight: '700' }
})
