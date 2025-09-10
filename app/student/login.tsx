"use client"

import { useRouter } from "expo-router"
import {
  EmailAuthProvider,
  fetchSignInMethodsForEmail,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
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
import React, { useEffect, useRef, useState } from "react"
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { auth, db } from "../../firebase"

const show = (title: string, msg?: string) => {
  if (Platform.OS === "web") (window as any)?.alert?.(msg ? `${title}\n\n${msg}` : title)
  else Alert.alert(title, msg)
}

const ALLOWED = /^[^@\s]+\.cse(2022|2023|2024|2025)@citchennai\.net$/i
const STASH_KEY = "PENDING_LINK" // JSON: { e, p }
const stashSet = (o: any) => { try { sessionStorage.setItem(STASH_KEY, JSON.stringify(o)) } catch {} }
const stashGet = (): null | { e: string; p: string } => {
  try { const r = sessionStorage.getItem(STASH_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
const stashDel = () => { try { sessionStorage.removeItem(STASH_KEY) } catch {} }

// roster check (resilient)
async function inRoster(email: string) {
  const e = email.trim().toLowerCase()
  const col = collection(db, "students")
  const keys = ["EMAIL_LOWER", "EMAIL", "email"] as const
  for (const k of keys) {
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

export default function StudentLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  // simple entrance anim
  const fade = useRef(new Animated.Value(0)).current
  const slide = useRef(new Animated.Value(16)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [])

  const finishLogin = async (e: string) => {
    try {
      if (auth.currentUser?.uid) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          { uid: auth.currentUser.uid, email: e, role: "student", lastLogin: serverTimestamp() },
          { merge: true }
        )
      }
    } catch {}
    router.replace({ pathname: "/student/dashboard", params: { student: e } })
  }

  // complete Google→password link after redirect (when initiated from Login)
  useEffect(() => {
    if (Platform.OS !== "web") return
    ;(async () => {
      const pending = stashGet()
      const res = await getRedirectResult(auth)
      if (!pending || !res) return
      try {
        const e = (res.user.email || "").toLowerCase()
        if (e !== pending.e) throw new Error(`Please use Google account ${pending.e}`)
        if (!ALLOWED.test(e)) throw new Error("Only cohort emails allowed.")
        if (!(await inRoster(e))) throw new Error("Your email is not in the student roster.")

        const cred = EmailAuthProvider.credential(pending.e, pending.p)
        await linkWithCredential(res.user, cred)

        await setDoc(
          doc(db, "users", res.user.uid),
          { uid: res.user.uid, email: pending.e, role: "student", lastLogin: serverTimestamp() },
          { merge: true }
        )
        stashDel()
        return finishLogin(pending.e)
      } catch (err: any) {
        await signOut(auth)
        stashDel()
        show("Linking failed", err?.message || String(err))
      }
    })()
  }, [])

  // Google redirect finisher (plain Google sign-in)
  useEffect(() => {
    if (Platform.OS !== "web") return
    ;(async () => {
      // if we’re in a linking flow, the block above will handle it
      if (stashGet()) return
      const res = await getRedirectResult(auth)
      if (!res) return
      const e = (res.user.email || "").toLowerCase()
      if (!ALLOWED.test(e)) { await signOut(auth); show("Access blocked", "Only cohort emails allowed."); return }
      if (!(await inRoster(e))) { await signOut(auth); show("Not registered", "Your email is not in the student roster."); return }

      await setDoc(doc(db, "users", res.user.uid), { uid: res.user.uid, email: e, role: "student", lastLogin: serverTimestamp() }, { merge: true })
      return finishLogin(e)
    })()
  }, [])

  const handleLogin = async () => {
    const e = email.trim().toLowerCase()
    const p = password.trim()
    if (!e || !p) return show("Missing", "Enter email & password")
    if (!ALLOWED.test(e)) return show("Access blocked", "Use your cohort email.")
    if (p.length < 6) return show("Password too short", "Use at least 6 characters.")

    try {
      setBusy(true)
      await signInWithEmailAndPassword(auth, e, p)
      if (!(await inRoster(e))) { await signOut(auth); show("Not registered", "Your email is not in the student roster."); return }
      return finishLogin(e)
    } catch (err: any) {
      const code = err?.code || ""
      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        // If this address is Google-only → start link flow
        const methods = await fetchSignInMethodsForEmail(auth, e)
        if (methods.includes("google.com") && !methods.includes("password")) {
          if (Platform.OS !== "web") { show("Google required", "Open on Web to link password to Google account."); return }
          const provider = new GoogleAuthProvider()
          provider.setCustomParameters({ login_hint: e, prompt: "select_account" })
          stashSet({ e, p })
          await signInWithRedirect(auth, provider) // finishes in useEffect above
          return
        }
        show("User not found", "Register first or contact admin.")
        return
      }
      if (code === "auth/wrong-password") return show("Wrong password", "Check your password and try again.")
      if (code === "auth/too-many-requests") return show("Too many attempts", "Please wait a minute and try again.")
      show("Login failed", err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    if (Platform.OS !== "web") { Alert.alert("Not available", "Google sign-in works on Web for now."); return }
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })
    try {
      const res = await signInWithPopup(auth, provider)
      const e = (res.user.email || "").toLowerCase()
      if (!ALLOWED.test(e)) { await signOut(auth); show("Access blocked", "Only cohort emails allowed."); return }
      if (!(await inRoster(e))) { await signOut(auth); show("Not registered", "Your email is not in the student roster."); return }
      await setDoc(doc(db, "users", res.user.uid), { uid: res.user.uid, email: e, role: "student", lastLogin: serverTimestamp() }, { merge: true })
      return finishLogin(e)
    } catch (err: any) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") { await signInWithRedirect(auth, provider); return }
      // If the email/password account already exists → link Google to that SAME uid (nice-to-have)
      if (err?.code === "auth/account-exists-with-different-credential") {
        const emailInUse = (err?.customData?.email || "").toLowerCase()
        const pendingCred = GoogleAuthProvider.credentialFromError?.(err)
        if (emailInUse && pendingCred) {
          const methods = await fetchSignInMethodsForEmail(auth, emailInUse)
          if (methods.includes("password")) {
            if (!password || password.length < 6) { show("Finish linking", "Enter your password above, then press Google again to link."); return }
            const userCred = await signInWithEmailAndPassword(auth, emailInUse, password)
            if (!(await inRoster(emailInUse))) { await signOut(auth); show("Not registered", "Your email is not in the student roster."); return }
            await linkWithCredential(userCred.user, pendingCred)
            await setDoc(doc(db, "users", userCred.user.uid), { uid: userCred.user.uid, email: emailInUse, role: "student", lastLogin: serverTimestamp() }, { merge: true })
            return finishLogin(emailInUse)
          }
        }
      }
      Alert.alert("Google sign-in failed", err instanceof Error ? err.message : String(err))
    }
  }

  const LoadingDots = ({ color = "#FFFFFF" }: { color?: string }) => {
    const d1 = React.useRef(new Animated.Value(0)).current
    const d2 = React.useRef(new Animated.Value(0)).current
    const d3 = React.useRef(new Animated.Value(0)).current
    useEffect(() => {
      const loop = (v: Animated.Value, delay: number) =>
        Animated.loop(Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 400, easing: Easing.linear, useNativeDriver: true, delay }),
          Animated.timing(v, { toValue: 0, duration: 400, easing: Easing.linear, useNativeDriver: true }),
        ])).start()
      loop(d1, 0); loop(d2, 130); loop(d3, 260)
    }, [])
    const dotStyle = (v: Animated.Value) => ({
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }],
    })
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Animated.View style={[s.dot, dotStyle(d1), { backgroundColor: color }]} />
        <Animated.View style={[s.dot, dotStyle(d2), { backgroundColor: color }]} />
        <Animated.View style={[s.dot, dotStyle(d3), { backgroundColor: color }]} />
      </View>
    )
  }

  const ScaleButton: React.FC<
    React.PropsWithChildren<{ disabled?: boolean; onPress?: () => void; style?: any; accessibilityLabel?: string }>
  > = ({ children, disabled, onPress, style, accessibilityLabel }) => {
    const scale = React.useRef(new Animated.Value(1)).current
    const onIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, friction: 6, tension: 120 })
    const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 })

    return (
      <Pressable disabled={disabled} onPress={onPress} onPressIn={() => onIn().start()} onPressOut={() => onOut().start()}
        android_ripple={{ color: "rgba(14,7,122,0.12)" }} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [{ opacity: disabled ? 0.6 : pressed ? 0.96 : 1 }, style]}>
        <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
      </Pressable>
    )
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Animated.View style={[s.card, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <Text style={s.title}>Student Login</Text>
        <Animated.View style={[s.underline, { transform: [{ scaleX: fade }] }]} />

        <TextInput
          placeholder="Email (e.g. rollno.cse2025@citchennai.net)"
          value={email}
          onChangeText={setEmail}
          style={s.input}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#6b7280"
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          style={s.input}
          secureTextEntry
          placeholderTextColor="#6b7280"
        />

        <ScaleButton onPress={handleLogin} disabled={busy} style={s.button} accessibilityLabel="Login">
          <View style={s.buttonInner}>
            <Text style={s.buttonText}>{busy ? "Working" : "Login"}</Text>
            {busy && <LoadingDots />}
          </View>
        </ScaleButton>

        <ScaleButton onPress={handleGoogle} disabled={busy} style={[s.ghostBtn, { marginTop: 12 }]} accessibilityLabel="Continue with Google on Web">
          <Text style={s.ghostTxt}>Continue with Google (Web)</Text>
        </ScaleButton>

        <Pressable onPress={() => router.replace("/student/register")} accessibilityRole="link" style={s.linkBtn}>
          <Text style={s.linkTxt}>New here? Create an account</Text>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 40, backgroundColor: "#F6F8FC" },
  card: { width: "100%", maxWidth: 560, backgroundColor: "#FFFFFF", paddingHorizontal: 20, paddingVertical: 22, borderRadius: 16, shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  underline: { height: 3, width: "28%", backgroundColor: "rgb(14, 7, 122)", borderRadius: 3, marginTop: 4, marginBottom: 18, transform: [{ scaleX: 0 }] },
  input: { width: "100%", maxWidth: 520, height: 54, borderWidth: 2, borderColor: "rgb(14, 7, 122)", backgroundColor: "#FFFFFF", color: "#0f172a", borderRadius: 14, paddingHorizontal: 16, marginBottom: 16 },
  button: { width: "100%", maxWidth: 520, height: 54, borderRadius: 14, alignSelf: "center", justifyContent: "center", marginTop: 4, marginBottom: 14, backgroundColor: "rgb(14, 7, 122)" },
  buttonInner: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  ghostBtn: { width: "100%", maxWidth: 520, height: 54, borderRadius: 14, borderWidth: 2, borderColor: "#E5E7EB", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginTop: 12 },
  ghostTxt: { textAlign: "center", color: "#0f172a", fontSize: 15, fontWeight: "600" },
  linkBtn: { paddingVertical: 10, marginTop: 20, alignItems: "center" },
  linkTxt: { textAlign: "center", color: "#0f172a", opacity: 0.8 },
  title: { fontSize: 24, fontWeight: "800", color: "#0f172a", textAlign: "left" },
})
