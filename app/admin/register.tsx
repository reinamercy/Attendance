// app/admin/register.tsx
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  fetchSignInMethodsForEmail, // ← add
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithPopup,
  signInWithRedirect, // ← add
  signOut,
  updateProfile,
} from "firebase/auth";


import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useState } from "react";
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
} from "react-native";
import { auth, db } from "../../firebase";



const show = (title: string, msg?: string, after?: () => void) => {
  if (Platform.OS === 'web') {
    // blocking alert on web; run callback after dismissal
    (window as any)?.alert?.(msg ? `${title}\n\n${msg}` : title);
    if (after) after();
  } else {
    // native: attach callback to OK button if provided
    Alert.alert(title, msg, after ? [{ text: 'OK', onPress: after }] : undefined);
  }
};



// Keep this if you still want to restrict teacher emails.
// Remove ALLOWED check below if you don't want this filter here.
const ALLOWED = /^[^@]*2005@gmail\.com$/;

export default function Register() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
  if (Platform.OS !== "web") return;
  (async () => {
    const res = await getRedirectResult(auth);
    if (!res) return;

    const eLS = (localStorage.getItem("LINK_E") || "").toLowerCase();
    const pLS = localStorage.getItem("LINK_P") || "";
    const nLS = localStorage.getItem("LINK_N") || "";
    localStorage.removeItem("LINK_E");
    localStorage.removeItem("LINK_P");
    localStorage.removeItem("LINK_N");
    if (!eLS || !pLS) return;

    const signedEmail = (res.user.email || "").toLowerCase();
    if (signedEmail !== eLS) {
      await signOut(auth);
      show("Wrong Google account", `Please sign in with Google as ${eLS} and try again.`);
      return;
    }

    try {
      const cred = EmailAuthProvider.credential(eLS, pLS);
      await linkWithCredential(res.user, cred);

      await Promise.all([
        setDoc(doc(db, "users", res.user.uid), {
          uid: res.user.uid, name: nLS || res.user.displayName || "Admin",
          email: eLS, role: "admin", createdAt: serverTimestamp(),
        }, { merge: true }),
        setDoc(doc(db, "allowedUsers", eLS), { email: eLS, createdAt: serverTimestamp() }, { merge: true }),
      ]);

      await signOut(auth);
      show("Account linked", "You can now login with email & password too.", () => r.replace("/admin/login"));
    } catch (e:any) {
      show("Registration failed", e?.message || String(e));
    }
  })();
}, []);

// Try popup first; if blocked → fall back to redirect.
// We stash info in localStorage so we can finish linking after redirect.
const googlePopupOrRedirect = async (e: string, n: string, p: string) => {
  const provider = new GoogleAuthProvider();
  try {
    const res = await signInWithPopup(auth, provider);
    return res.user; // success via popup
  } catch (err: any) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
      if (Platform.OS !== "web") throw err;
      localStorage.setItem("LINK_E", e);
      localStorage.setItem("LINK_P", p);
      localStorage.setItem("LINK_N", n);
      await signInWithRedirect(auth, provider); // page navigates
      return null;
    }
    throw err;
  }
};
// Detect Safari (incl. iOS Safari)
const isSafari = () =>
  typeof navigator !== "undefined" &&
  /Safari/i.test(navigator.userAgent) &&
  !/Chrome|CriOS|FxiOS/i.test(navigator.userAgent);

// Start Google **redirect** (no popup, works in Safari)
const startGoogleRedirect = async (e: string, n: string, p: string) => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: e, prompt: "select_account" });

  // stash so we can finish linking after redirect
  localStorage.setItem("LINK_E", e);
  localStorage.setItem("LINK_P", p);
  localStorage.setItem("LINK_N", n);

  await signInWithRedirect(auth, provider); // navigates away
};

const onRegister = async () => {
  const e = email.trim().toLowerCase();
  const n = name.trim();
  const p = pass.trim();

  if (!n) { show('Missing', 'Enter your full name'); return; }
  if (!e || !e.includes('@')) { show('Invalid email', 'Enter a valid email'); return; }
  if (p.length < 6) { show('Weak password', 'Use at least 6 characters'); return; }
  if (!ALLOWED.test(e)) { show('Register with the organization mail!'); return; }

  try {
    setLoading(true);
    const methods = await fetchSignInMethodsForEmail(auth, e);

    // A) Email is Google-only → prove ownership and LINK password to the same uid
    if (methods.includes('google.com') && !methods.includes('password')) {
      if (Platform.OS !== 'web') {
        show('Google required', 'Open this screen on Web, sign in with Google, then set a password here.');
        return;
      }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ login_hint: e, prompt: 'select_account' });

      try {
        // try popup first (Chrome/Edge) …
        const res = await signInWithPopup(auth, provider);
        const signedEmail = (res.user.email || '').toLowerCase();
        if (signedEmail !== e) {
          await signOut(auth);
          show('Wrong Google account', `Please sign in with Google as ${e} and try again.`);
          return;
        }

        const credential = EmailAuthProvider.credential(e, p);
        await linkWithCredential(res.user, credential);

        await Promise.all([
          setDoc(doc(db, 'users', res.user.uid), {
            uid: res.user.uid, name: n, email: e, role: 'admin', createdAt: serverTimestamp(),
          }, { merge: true }),
          setDoc(doc(db, 'allowedUsers', e), { email: e, createdAt: serverTimestamp() }, { merge: true }),
        ]);

        await signOut(auth);
        show('Account linked', 'You can now login with email & password too.', () => r.replace('/admin/login'));
        return;
      } catch (popupErr: any) {
        // …if popup blocked (Safari/Firefox), fall back to redirect
        if (popupErr?.code === 'auth/popup-blocked' || popupErr?.code === 'auth/popup-closed-by-user') {
          localStorage.setItem('LINK_E', e);
          localStorage.setItem('LINK_P', p);
          localStorage.setItem('LINK_N', n);
          await signInWithRedirect(auth, provider); // navigates; finish in getRedirectResult useEffect
          return;
        }
        throw popupErr;
      }
    }

    // B) Already has password (or already linked)
    if (methods.length > 0) {
      show('Already registered', 'Please log in.', () => r.replace('/admin/login'));
      return;
    }

    // C) Fresh create
    const cred = await createUserWithEmailAndPassword(auth, e, p);
    try { await updateProfile(cred.user, { displayName: n }); } catch {}

    await Promise.all([
      setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid, name: n, email: e, role: 'admin', createdAt: serverTimestamp(),
      }, { merge: true }),
      setDoc(doc(db, 'allowedUsers', e), { email: e, createdAt: serverTimestamp() }, { merge: true }),
    ]);

    await signOut(auth);
    show('Account created', 'You can log in now.', () => r.replace('/admin/login'));
  } catch (err: any) {
    // D) Safety net: if create raced and email already exists, do the Google redirect linker
    if (err?.code === 'auth/email-already-in-use' && Platform.OS === 'web') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ login_hint: e, prompt: 'select_account' });
      localStorage.setItem('LINK_E', e);
      localStorage.setItem('LINK_P', p);
      localStorage.setItem('LINK_N', n);
      await signInWithRedirect(auth, provider);
      return;
    }
    const msg = err?.message || String(err);
    show('Registration failed', msg);
  } finally {
    setLoading(false);
  }
};


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Create an account</Text>

        <TextInput
          style={styles.input}
          placeholder="Full name"
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={pass}
          onChangeText={setPass}
        />

        <TouchableOpacity style={styles.btn} disabled={loading} onPress={onRegister}>
          {loading ? <ActivityIndicator /> : <Text style={styles.btnText}>Register</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => r.replace("/admin/login")}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Page — dark like original
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
  },

  // Card wrapper
  card: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: '#000080',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    padding: 20,
  },

  // Heading
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#E5E7EB',
    textAlign: 'center',
    marginBottom: 18,
  },

  // Inputs — white borders now
  input: {
    width: '100%',
    height: 54,
    borderWidth: 2,
    borderColor: '#FFFFFF',          // was blue → now white
    backgroundColor: '#000080',
    color: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },

  // Primary button — white box with blue text
  btn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',      // was blue → now white
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  btnText: {
    color: 'rgb(14, 7, 122)',        // was white → now brand blue
    fontSize: 16,
    fontWeight: '700',
  },

  // Footer link — flip to blue
  link: {
    textAlign: 'center',
    color: 'rgb(255, 255, 255)',        // was light → now blue
    opacity: 1,
    marginTop: 10,
    fontWeight: '700',
  },

  // Optional: outlined alt button (e.g., “Register with Google”) — white border, blue text
  ghostBtn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFFFFF',          // was dark → now white
    backgroundColor: '#111216',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  ghostTxt: {
    textAlign: 'center',
    color: 'rgb(14, 7, 122)',        // was near-white → now blue
    fontSize: 15,
    fontWeight: '700',
  },
})
