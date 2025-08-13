import { useRouter } from 'expo-router'
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import React, { useState } from 'react'
import { Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { auth, db } from '../../firebase'

// Only allow emails like ******2005@gmail.com
const ALLOWED = /^[^@]*2005@gmail\.com$/

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const finishLogin = async (e: string) => {
    try { await auth.currentUser?.getIdToken(true) } catch {}
    // upsert admin profile
    try {
      if (auth.currentUser?.uid) {
        await setDoc(
          doc(db, 'admins', auth.currentUser.uid),
          { email: e, createdAt: Date.now() },
          { merge: true }
        )
      }
    } catch {}
    router.replace({ pathname: '/admin/dashboard', params: { mentor: e } })
  }

  const handleLogin = async () => {
    const e = email.trim()
    const p = password.trim()

    if (!e || !p) return Alert.alert('Missing', 'Enter email & password')
    if (!ALLOWED.test(e)) return Alert.alert('Access blocked', 'Only teacher emails ending with 2005@gmail.com are allowed for now.')
    if (p.length < 6) {
      return Alert.alert('Password too short', 'Use at least 6 characters (needed if this creates your account).')
    }

    try {
      setBusy(true)
      // Try normal sign-in first
      await signInWithEmailAndPassword(auth, e, p)
      return finishLogin(e)
    } catch (err: any) {
      const code = err?.code || ''
      // If the user doesn't exist yet, auto-create the account
      if (code === 'auth/user-not-found') {
        try {
          const cred = await createUserWithEmailAndPassword(auth, e, p)
          await setDoc(doc(db, 'admins', cred.user.uid), { email: e, createdAt: Date.now() }, { merge: true })
          return finishLogin(e)
        } catch (err2: any) {
          const msg2 = err2?.message || String(err2)
          return Alert.alert('Registration failed', msg2)
        } finally {
          setBusy(false)
        }
      }

      // Helpful errors for common cases
      if (code === 'auth/operation-not-allowed') {
        return Alert.alert('Enable Email/Password', 'In Firebase Console > Authentication > Sign-in method, enable "Email/Password".')
      }
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        return Alert.alert('Wrong password', 'Check your password and try again.')
      }
      if (code === 'auth/too-many-requests') {
        return Alert.alert('Too many attempts', 'Please wait a minute and try again.')
      }

      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert('Login failed', msg)
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    if (Platform.OS !== 'web') {
      return Alert.alert('Not available', 'Google sign-in works on Web now. Native coming next.')
    }
    try {
      const provider = new GoogleAuthProvider()
      const cred = await signInWithPopup(auth, provider)
      const e = cred.user.email ?? ''
      if (!ALLOWED.test(e)) {
        await signOut(auth)
        return Alert.alert('Access blocked', 'Only teacher emails ending with 2005@gmail.com are allowed for now.')
      }
      // upsert admin + refresh token
      try {
        await auth.currentUser?.getIdToken(true)
        await setDoc(doc(db, 'admins', auth.currentUser!.uid), { email: e, createdAt: Date.now() }, { merge: true })
      } catch {}
      router.replace({ pathname: '/admin/dashboard', params: { mentor: e } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert('Google sign-in failed', msg)
    }
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Admin / Mentor Login</Text>

      <TextInput
        placeholder="Email (e.g. abc2005@gmail.com)"
        value={email}
        onChangeText={setEmail}
        style={s.input}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={s.input}
        secureTextEntry
      />

      <TouchableOpacity style={[s.button, busy && { opacity: 0.6 }]} onPress={handleLogin} disabled={busy}>
        <Text style={s.buttonText}>{busy ? 'Working…' : 'Login / Create'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.ghostBtn, { marginTop: 12 }]} onPress={handleGoogle}>
        <Text style={s.ghostTxt}>Continue with Google</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 6, marginBottom: 12 },
  button: { padding: 14, backgroundColor: '#4e44ce', borderRadius: 6 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  ghostBtn: { padding: 10 },
  ghostTxt: { textAlign: 'center', color: '#4e44ce', fontWeight: '600' }
})
