"use client"

import { useRouter } from "expo-router"
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth"
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore"
import React from "react"
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { auth, db } from "../../firebase"

/** ===== helpers ===== */
const show = (title: string, msg?: string, after?: () => void) => {
  if (Platform.OS === "web") {
    ;(window as any)?.alert?.(msg ? `${title}\n\n${msg}` : title)
    if (after) after()
  } else {
    Alert.alert(title, msg, after ? [{ text: "OK", onPress: after }] : undefined)
  }
}

// allow only cohort emails (keep your policy); drop this if you don't want the guard
const ALLOWED = /^[^@\s]+\.cse(2022|2023|2024|2025)@citchennai\.net$/i

// session-only stash for Google redirect round-trip
const STASH_KEY = "PENDING_LINK" // JSON: { e, p, n }

const stashSet = (obj: any) => {
  try { sessionStorage.setItem(STASH_KEY, JSON.stringify(obj)) } catch {}
}
const stashGet = (): null | { e: string; p: string; n?: string } => {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
const stashDel = () => { try { sessionStorage.removeItem(STASH_KEY) } catch {} }

// roster (kept simple & resilient)
async function inRoster(email: string) {
  const e = email.trim().toLowerCase()
  const col = collection(db, "students")
  const tryKeys = ["EMAIL_LOWER", "EMAIL", "email"] as const
  for (const k of tryKeys) {
    const snap = await getDocs(query(col, where(k, "==", e)))
    if (!snap.empty) {
      return snap.docs.some((d) => {
        const x = d.data() as any
        const hasCore = !!(x?.ROLLNO && x?.CLASS)
        const inactive = (typeof x?.status === "string" && x.status.toLowerCase() === "inactive") || x?.ACTIVE === false
        return hasCore && !inactive
      })
    }
  }
  return false
}

export default function StudentRegister() {
  const r = useRouter()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [pass, setPass] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  // finish Google→password link after redirect (Safari-safe)
  React.useEffect(() => {
    if (Platform.OS !== "web") return
    ;(async () => {
      const pending = stashGet()
      const res = await getRedirectResult(auth)
      if (!pending || !res) return

      try {
        const e = (res.user.email || "").toLowerCase()
        if (e !== pending.e) throw new Error(`Wrong Google account. Please use ${pending.e}`)
        if (!ALLOWED.test(e)) throw new Error("Use your citchennai.net cohort email.")
        if (!(await inRoster(e))) throw new Error("Your email is not in the student roster.")

        // link password to the SAME Google uid
        const cred = EmailAuthProvider.credential(pending.e, pending.p)
        await linkWithCredential(res.user, cred)

        await setDoc(
          doc(db, "users", res.user.uid),
          {
            uid: res.user.uid,
            name: pending.n || res.user.displayName || "Student",
            email: pending.e,
            role: "student",
            createdAt: serverTimestamp(),
          },
          { merge: true }
        )
        await signOut(auth)
        show("Account linked", "You can now login with email & password too.", () => r.replace("/student/login"))
      } catch (err: any) {
        await signOut(auth)
        show("Linking failed", err?.message || String(err))
      } finally {
        stashDel()
      }
    })()
  }, [])

  const onRegister = async () => {
    const e = email.trim().toLowerCase()
    const n = name.trim()
    const p = pass.trim()

    if (!n) return show("Missing", "Enter your full name")
    if (!e || !e.includes("@")) return show("Invalid email", "Enter a valid email")
    if (!ALLOWED.test(e)) return show("Use your student mail", "e.g. rollno.cse2025@citchennai.net")
    if (p.length < 6) return show("Weak password", "Use at least 6 characters")
    if (!(await inRoster(e))) return show("Not registered", "Your email is not in the student roster.")

    try {
      setLoading(true)
      const methods = await fetchSignInMethodsForEmail(auth, e)

      // A) Google-only → prove ownership, then LINK password to same uid
      if (methods.includes("google.com") && !methods.includes("password")) {
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ login_hint: e, prompt: "select_account" })
        stashSet({ e, p, n })

        try {
          // popup first
          const res = await signInWithPopup(auth, provider)
          const signed = (res.user.email || "").toLowerCase()
          if (signed !== e) throw new Error(`Please pick Google account: ${e}`)

          const cred = EmailAuthProvider.credential(e, p)
          await linkWithCredential(res.user, cred)

          await setDoc(
            doc(db, "users", res.user.uid),
            { uid: res.user.uid, name: n, email: e, role: "student", createdAt: serverTimestamp() },
            { merge: true }
          )
          await signOut(auth)
          stashDel()
          show("Account linked", "You can now login with email & password too.", () => r.replace("/student/login"))
          return
        } catch (err: any) {
          if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
            await signInWithRedirect(auth, provider) // finish in useEffect
            return
          }
          stashDel()
          throw err
        }
      }

      // B) Already has password/linked → go to login
      if (methods.length > 0) {
        show("Already registered", "Please log in.", () => r.replace("/student/login"))
        return
      }

      // C) Fresh create
      const cred = await createUserWithEmailAndPassword(auth, e, p)
      try { await updateProfile(cred.user, { displayName: n }) } catch {}
      await setDoc(
        doc(db, "users", cred.user.uid),
        { uid: cred.user.uid, name: n, email: e, role: "student", createdAt: serverTimestamp() },
        { merge: true }
      )

      await signOut(auth)
      show("Account created", "You can log in now.", () => r.replace("/student/login"))
    } catch (err: any) {
      // race: someone created in parallel as Google
      if (err?.code === "auth/email-already-in-use" && Platform.OS === "web") {
        const provider = new GoogleAuthProvider()
        provider.setCustomParameters({ login_hint: e, prompt: "select_account" })
        stashSet({ e, p, n })
        await signInWithRedirect(auth, provider)
        return
      }
      show("Registration failed", err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Create your student account</Text>

        <TextInput
          style={styles.input}
          placeholder="Full name"
          autoCapitalize="words"
          autoComplete="off"
          textContentType="none"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email (e.g. rollno.cse2025@citchennai.net)"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password (min 6 chars)"
          secureTextEntry
          autoComplete="off"
          textContentType="oneTimeCode"
          value={pass}
          onChangeText={setPass}
        />

        <TouchableOpacity style={styles.btn} disabled={loading} onPress={onRegister}>
          {loading ? <ActivityIndicator /> : <Text style={styles.btnText}>Register</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => r.replace("/student/login")}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 40, backgroundColor: "#FFFFFF" },
  card: { width: "100%", maxWidth: 560, backgroundColor: "#000080", borderRadius: 16, borderWidth: 1.5, borderColor: "#FFFFFF", padding: 20 },
  title: { fontSize: 24, fontWeight: "800", color: "#E5E7EB", textAlign: "center", marginBottom: 18 },
  input: { width: "100%", height: 54, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#000080", color: "#E5E7EB", borderRadius: 14, paddingHorizontal: 16, marginBottom: 16 },
  btn: { width: "100%", height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 14, backgroundColor: "#FFFFFF", borderWidth: 2, borderColor: "#FFFFFF" },
  btnText: { color: "rgb(14, 7, 122)", fontSize: 16, fontWeight: "700" },
  link: { textAlign: "center", color: "rgb(255, 255, 255)", opacity: 1, marginTop: 10, fontWeight: "700" },
})
