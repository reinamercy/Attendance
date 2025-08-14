// app/admin/register.tsx
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
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

      // Block duplicate: if already registered, send to login
      const methods = await fetchSignInMethodsForEmail(auth, e);
      if (methods.length > 0) {
        show('Already registered', 'Please log in.', () => r.replace('/admin/login'));
        return;
      }


      // Create auth account
      const cred = await createUserWithEmailAndPassword(auth, e, p);

      // Optional: set display name
      try { await updateProfile(cred.user, { displayName: n }); } catch {}

      // Firestore: profile (by uid)
      await setDoc(
        doc(db, "users", cred.user.uid),
        {
          uid: cred.user.uid,
          name: n,
          email: e,
          role: "admin",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Firestore: whitelist (by email)
      await setDoc(
        doc(db, "allowedUsers", e),
        { email: e, createdAt: serverTimestamp() },
        { merge: true }
      );

      show('Account created', 'You can log in now.', () => r.replace('/admin/login'));

    } catch (err: any) {
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
  container: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#0b0b0c" },
  card: { backgroundColor: "#151518", padding: 20, borderRadius: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginBottom: 4, textAlign: "center" },
  input: {
    backgroundColor: "#1e1e23",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#fff",
  },
  btn: { backgroundColor: "#635bff", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  link: { color: "#9aa0a6", textAlign: "center", marginTop: 10 },
});
