"use client"

// app/admin/login.tsx
import { useRouter } from "expo-router"
import {
  fetchSignInMethodsForEmail, // ← add
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect, // ← add
  signOut,
} from "firebase/auth"

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import React, { useState } from "react"
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  // new:
  Animated,
  Easing,
  KeyboardAvoidingView,
  Pressable,
} from "react-native"
import { auth, db } from "../../firebase"
const show = (title: string, msg?: string) => {
  if (Platform.OS === "web") {
    // @ts-ignore
    ;(window as any)?.alert?.(msg ? `${title}\n\n${msg}` : title)
  } else {
    Alert.alert(title, msg)
  }
}

// Only allow emails like ******2005@gmail.com
const ALLOWED = /^[^@]*2005@gmail\.com$/

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const fade = React.useRef(new Animated.Value(0)).current
  const slide = React.useRef(new Animated.Value(18)).current
  const underline = React.useRef(new Animated.Value(0)).current
  const [focused, setFocused] = React.useState<"email" | "password" | null>(null)

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(underline, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  const finishLogin = async (e: string) => {
    try {
      if (auth.currentUser?.uid) {
        await setDoc(
          doc(db, "admins", auth.currentUser.uid),
          { email: e, uid: auth.currentUser.uid, createdAt: serverTimestamp() },
          { merge: true },
        )
      }
    } catch {}
    router.replace({ pathname: "/admin/dashboard", params: { mentor: e } })
  }

  React.useEffect(() => {
    if (Platform.OS !== "web") return
    ;(async () => {
      const res = await getRedirectResult(auth)
      if (!res) return
      const e = (res.user.email ?? "").toLowerCase()
      if (!ALLOWED.test(e)) {
        await signOut(auth)
        show("Access blocked", "Only teacher emails ending with 2005@gmail.com are allowed for now.")
        return
      }

      await Promise.all([
        setDoc(
          doc(db, "admins", res.user.uid),
          { email: e, uid: res.user.uid, createdAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(
          doc(db, "users", res.user.uid),
          { uid: res.user.uid, email: e, role: "admin", createdAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(doc(db, "allowedUsers", e), { email: e, createdAt: serverTimestamp() }, { merge: true }),
      ])

      return finishLogin(e)
    })()
  }, [])

  const checkWhitelist = async (e: string) => {
    const snap = await getDoc(doc(db, "allowedUsers", e))
    return snap.exists()
  }

  const isSafari = () =>
    typeof navigator !== "undefined" &&
    /Safari/i.test(navigator.userAgent) &&
    !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent)

  const handleLogin = async () => {
    const e = email.trim().toLowerCase()
    const p = password.trim()

    if (!e || !p) {
      show("Missing", "Enter email & password")
      return
    }
    if (!ALLOWED.test(e)) {
      show("Access blocked", "Only teacher emails ending with 2005@gmail.com are allowed for now.")
      return
    }
    if (p.length < 6) {
      show("Password too short", "Use at least 6 characters.")
      return
    }

    try {
      setBusy(true)
      await signInWithEmailAndPassword(auth, e, p)

      const ok = await checkWhitelist(e)
      if (!ok) {
        await signOut(auth)
        show("Access denied", "This email is not registered. Please register first.")
        return
      }

      return finishLogin(e)
    } catch (err: any) {
      const code = err?.code || ""

      if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
        const methods = await fetchSignInMethodsForEmail(auth, e)
        if (methods.includes("google.com") && !methods.includes("password")) {
          show("This account is Google-only", "Login with Google, or go to Register to set a password.")
          return
        }
        show("Oops! User not found. Register to begin")
        return
      }

      if (code === "auth/wrong-password") {
        show("Wrong password", "Check your password and try again.")
        return
      }
      if (code === "auth/too-many-requests") {
        show("Too many attempts", "Please wait a minute and try again.")
        return
      }

      const msg = err instanceof Error ? err.message : String(err)
      show("Login failed", msg)
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    if (Platform.OS !== "web") {
      return Alert.alert("Not available", "Google sign-in works on Web now. Native coming next.")
    }

    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: "select_account" })

    try {
      // Safari? We’ll redirect instead of popup elsewhere via useEffect.
      const res = await signInWithPopup(auth, provider)
      const e = (res.user.email ?? "").toLowerCase()

      if (!ALLOWED.test(e)) {
        await signOut(auth)
        show("Access blocked", "Only teacher emails ending with 2005@gmail.com are allowed for now.")
        return
      }

      await Promise.all([
        setDoc(
          doc(db, "admins", res.user.uid),
          { email: e, uid: res.user.uid, createdAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(
          doc(db, "users", res.user.uid),
          { uid: res.user.uid, email: e, role: "admin", createdAt: serverTimestamp() },
          { merge: true },
        ),
        setDoc(doc(db, "allowedUsers", e), { email: e, createdAt: serverTimestamp() }, { merge: true }),
      ])

      return finishLogin(e)
    } catch (err: any) {
      // 1) Popup blocked → redirect fallback
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
        await signInWithRedirect(auth, provider)
        return
      }

      // 2) Email/password account already exists → link Google to that SAME uid
      if (err?.code === "auth/account-exists-with-different-credential") {
        const emailInUse = (err?.customData?.email || "").toLowerCase()
        const pendingCred = GoogleAuthProvider.credentialFromError?.(err)
        if (emailInUse && pendingCred) {
          const methods = await fetchSignInMethodsForEmail(auth, emailInUse)
          if (methods.includes("password")) {
            if (!password || password.length < 6) {
              show("Finish linking", "Enter your password above, then press Google again to link.")
              return
            }
            // sign in with existing password account, then link Google
            const userCred = await signInWithEmailAndPassword(auth, emailInUse, password)
            await linkWithCredential(userCred.user, pendingCred)

            await Promise.all([
              setDoc(
                doc(db, "admins", userCred.user.uid),
                { email: emailInUse, uid: userCred.user.uid, createdAt: serverTimestamp() },
                { merge: true },
              ),
              setDoc(
                doc(db, "users", userCred.user.uid),
                { uid: userCred.user.uid, email: emailInUse, role: "admin", createdAt: serverTimestamp() },
                { merge: true },
              ),
              setDoc(
                doc(db, "allowedUsers", emailInUse),
                { email: emailInUse, createdAt: serverTimestamp() },
                { merge: true },
              ),
            ])

            return finishLogin(emailInUse)
          }
        }
      }

      const msg = err instanceof Error ? err.message : String(err)
      Alert.alert("Google sign-in failed", msg)
    }
  }

  const LoadingDots = ({ color = "#FFFFFF" }: { color?: string }) => {
    const d1 = React.useRef(new Animated.Value(0)).current
    const d2 = React.useRef(new Animated.Value(0)).current
    const d3 = React.useRef(new Animated.Value(0)).current

    React.useEffect(() => {
      const makeLoop = (v: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 400, easing: Easing.linear, useNativeDriver: true, delay }),
            Animated.timing(v, { toValue: 0, duration: 400, easing: Easing.linear, useNativeDriver: true }),
          ]),
        ).start()

      makeLoop(d1, 0)
      makeLoop(d2, 130)
      makeLoop(d3, 260)
    }, [])

    const dotStyle = (v: Animated.Value) => ({
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
      transform: [
        {
          translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }),
        },
      ],
    })

    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Animated.View style={[s.dot, dotStyle(d1), { backgroundColor: color }]} />
        <Animated.View style={[s.dot, dotStyle(d2), { backgroundColor: color }]} />
        <Animated.View style={[s.dot, dotStyle(d3), { backgroundColor: color }]} />
      </View>
    )
  }

  const ScaleButton = ({
    children,
    onPress,
    disabled,
    style,
    accessibilityLabel,
  }: {
    children: React.ReactNode
    onPress?: () => void
    disabled?: boolean
    style?: any
    accessibilityLabel?: string
  }) => {
    const scale = React.useRef(new Animated.Value(1)).current
    const onIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, friction: 6, tension: 120 })
    const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 120 })

    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => onIn().start()}
        onPressOut={() => onOut().start()}
        android_ripple={{ color: "rgba(14,7,122,0.12)" }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [{ opacity: disabled ? 0.6 : pressed ? 0.96 : 1 }, style]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
      </Pressable>
    )
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Animated.View style={[s.card, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <Text style={s.title}>Admin / Mentor Login</Text>
        <Animated.View
          style={[
            s.underline,
            {
              transform: [{ scaleX: underline }],
            },
          ]}
        />

        <TextInput
          placeholder="Email (e.g. abc2005@gmail.com)"
          value={email}
          onChangeText={setEmail}
          style={[s.input, focused === "email" && s.inputFocused]}
          keyboardType="email-address"
          autoCapitalize="none"
          onFocus={() => setFocused("email")}
          onBlur={() => setFocused(null)}
          accessibilityLabel="Email"
          placeholderTextColor="#6b7280"
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          style={[s.input, focused === "password" && s.inputFocused]}
          secureTextEntry
          onFocus={() => setFocused("password")}
          onBlur={() => setFocused(null)}
          accessibilityLabel="Password"
          placeholderTextColor="#6b7280"
        />

        <ScaleButton onPress={handleLogin} disabled={busy} style={s.button} accessibilityLabel="Login">
          <View style={s.buttonInner}>
            <Text style={s.buttonText}>{busy ? "Working" : "Login"}</Text>
            {busy && <LoadingDots />}
          </View>
        </ScaleButton>

        <ScaleButton
          onPress={handleGoogle}
          disabled={busy}
          style={[s.ghostBtn, { marginTop: 12 }]}
          accessibilityLabel="Continue with Google on Web"
        >
          <Text style={s.ghostTxt}>Continue with Google (Web)</Text>
        </ScaleButton>

        <Pressable
          onPress={() => router.replace("/admin/register")}
          accessibilityRole="link"
          accessibilityLabel="Create a new account"
          style={s.linkBtn}
        >
          <Text style={s.linkTxt}>New here? Create an account</Text>
        </Pressable>
      </Animated.View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  underline: {
    height: 3,
    width: "28%",
    backgroundColor: "rgb(14, 7, 122)",
    borderRadius: 3,
    marginTop: 4,
    marginBottom: 18,
    transform: [{ scaleX: 0 }],
    transformOrigin: "left",
  },
  input: {
    width: "100%",
    maxWidth: 520,
    height: 54,
    borderWidth: 2,
    borderColor: "rgb(14, 7, 122)",
    backgroundColor: "#FFFFFF",
    color: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  inputFocused: {
    borderColor: "rgb(14, 7, 122)",
    shadowColor: "rgb(14, 7, 122)",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  button: {
    width: "100%",
    maxWidth: 520,
    height: 54,
    borderRadius: 14,
    alignSelf: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: "rgb(14, 7, 122)",
  },
  buttonInner: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ghostBtn: {
    width: "100%",
    maxWidth: 520,
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  ghostTxt: {
    textAlign: "center",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "600",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: "#F6F8FC",
  },
  linkBtn: { paddingVertical: 10, marginTop: 20, alignItems: "center" },
  linkTxt: { textAlign: "center", color: "#0f172a", opacity: 0.8 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "left",
  },
})
