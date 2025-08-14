// app/admin/login.tsx
import { useRouter } from 'expo-router'
import {
  fetchSignInMethodsForEmail, GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import React, { useState } from 'react'
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import { auth, db } from '../../firebase'
const show = (title: string, msg?: string) => {
  if (Platform.OS === 'web') {
    // @ts-ignore
    (window as any)?.alert?.(msg ? `${title}\n\n${msg}` : title);
  } else {
    Alert.alert(title, msg);
  }
};


// Only allow emails like ******2005@gmail.com
const ALLOWED = /^[^@]*2005@gmail\.com$/

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const finishLogin = async (e: string) => {
    try {
      if (auth.currentUser?.uid) {
        await setDoc(
          doc(db, 'admins', auth.currentUser.uid),
          { email: e, uid: auth.currentUser.uid, createdAt: serverTimestamp() },
          { merge: true }
        )
      }
    } catch {}
    router.replace({ pathname: '/admin/dashboard', params: { mentor: e } })
  }

  const checkWhitelist = async (e: string) => {
    const snap = await getDoc(doc(db, 'allowedUsers', e))
    return snap.exists()
  }

const handleLogin = async () => {
  const e = email.trim().toLowerCase()
  const p = password.trim()

  if (!e || !p) { show('Missing', 'Enter email & password'); return }
  if (!ALLOWED.test(e)) { show('Access blocked', 'Only teacher emails ending with 2005@gmail.com are allowed for now.'); return }
  if (p.length < 6) { show('Password too short', 'Use at least 6 characters.'); return }

  try {
    setBusy(true)
    await signInWithEmailAndPassword(auth, e, p)

    const ok = await checkWhitelist(e)
    if (!ok) {
      await signOut(auth)
      show('Access denied', 'This email is not registered. Please register first.')
      return
    }

    return finishLogin(e)
  } catch (err: any) {
      const code = err?.code || ''

      // explicit case (if it ever comes through)
      if (code === 'auth/user-not-found') { show('Oops! User not found. Register to begin'); return }

      // Firebase sometimes returns this for both wrong password AND unknown user
      if (code === 'auth/invalid-credential') {
        const methods = await fetchSignInMethodsForEmail(auth, e)
        if (methods.length === 0) {
          show('Oops! User not found. Register to begin')
          return
        }
        show('Wrong password', 'Check your password and try again.')
        return
      }

      if (code === 'auth/wrong-password') { show('Wrong password', 'Check your password and try again.'); return }
      if (code === 'auth/too-many-requests') { show('Too many attempts', 'Please wait a minute and try again.'); return }

      const msg = err instanceof Error ? err.message : String(err)
      show('Login failed', msg)
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
        <Text style={s.buttonText}>{busy ? 'Working…' : 'Login'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[s.ghostBtn, { marginTop: 12 }]} onPress={handleGoogle} disabled={busy}>
        <Text style={s.ghostTxt}>Continue with Google (Web)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.linkBtn} onPress={() => router.replace('/admin/register')}>
        <Text style={s.linkTxt}>New here? Create an account</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  // Page
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: '#F6F8FC',
  },

  // Heading
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 18,
  },

  // Inputs — full-width with clear borders
  input: {
    width: '100%',
    maxWidth: 520,
    height: 54,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Primary button (Sign In)
  button: {
    width: '100%',
    maxWidth: 520,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Google button (outlined)
  ghostBtn: {
    width: '100%',
    maxWidth: 520,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  ghostTxt: {
    textAlign: 'center',
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '600',
  },

  // Footer link
  linkBtn: { paddingVertical: 10, marginTop: 20 },
  linkTxt: { textAlign: 'center', color: '#0f172a', opacity: 0.8 },
})
