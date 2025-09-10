// app/student/dashboard.tsx
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import Svg, { Circle } from "react-native-svg";
import { auth, db } from "../../firebase";

/* --------------------------- small debug switch --------------------------- */
const DEBUG = true;

/* -------------------- hoisted helpers (no init errors) -------------------- */
function getAcademicYear() {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; // Jul–Jun
  return `${y}-${y + 1}`;
}
function getAcademicYearRange(startY?: number) {
  const now = new Date();
  const y =
    typeof startY === "number"
      ? startY
      : now.getMonth() >= 6
      ? now.getFullYear()
      : now.getFullYear() - 1;
  const start = new Date(y, 6, 1, 0, 0, 0, 0); // Jul 1
  const end = new Date(y + 1, 5, 30, 23, 59, 59, 999); // Jun 30
  return [start, end] as const;
}
function parseDateToJs(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (val?.toDate) {
    try { return val.toDate(); } catch {}
  }
  if (typeof val?.seconds === "number") return new Date(val.seconds * 1000);
  if (typeof val === "string") {
    const s = val.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); // YYYY-MM-DD
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); // DD-MM-YYYY
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    if (!isNaN(d as any)) return d;
  }
  return null;
}
function toLocalDateKey(raw: any): string | null {
  // if Firestore doc already stores "YYYY-MM-DD", just use it
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  const d = parseDateToJs(raw);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`; // LOCAL YYYY-MM-DD (no UTC shift)
}

function dateInAY(d: Date, ay: string) {
  const startY = Number(ay.slice(0, 4));
  const [start, end] = getAcademicYearRange(startY);
  return d >= start && d <= end;
}
function extractYear(obj: any) {
  if (!obj) return null;
  if (typeof obj.YEAR === "number") return obj.YEAR;
  if (typeof obj.YEAR === "string") {
    const m = obj.YEAR.match(/[1-4]/);
    if (m) return Number(m[0]);
  }
  if (typeof obj.CLASS === "string") {
    const m =
      obj.CLASS.match(/\(?\s*year\s*([1-4])\s*\)?/i) ||
      obj.CLASS.match(/([1-4])(?:st|nd|rd|th)?\s*year/i);
    if (m) return Number(m[1]);
  }
  return null;
}
function pickBestStudentDoc(arr: any[]) {
  const ts = (t: any) =>
    t && typeof t?.toMillis === "function"
      ? t.toMillis()
      : typeof t === "number"
      ? t
      : 0;
  const scored = arr.map((d) => ({
    doc: d,
    cur: !!d.IS_CURRENT,
    yr: extractYear(d) ?? 0,
    upd: ts(d.UPDATED_AT) || ts(d.CREATED_AT),
  }));
  scored.sort(
    (a, b) =>
      Number(b.cur) - Number(a.cur) || b.yr - a.yr || (b.upd || 0) - (a.upd || 0)
  );
  return scored[0]?.doc;
}
function normalizeClassBase(s: string) {
  return String(s || "")
    .replace(/\(\s*year\s*[1-4]\s*\)/gi, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function classVariants(cls: string) {
  const s = String(cls || "").trim();
  const noYear = s.replace(/\(\s*year\s*[1-4]\s*\)/gi, "").trim();
  const spaced = noYear.replace(/\s*-\s*/g, " - ");
  const tight = noYear.replace(/\s*-\s*/g, "-");
  const noHyph = noYear.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const uniq = Array.from(new Set([s, noYear, spaced, tight, noHyph]));
  return Array.from(new Set(uniq.flatMap((x) => [x, x.toUpperCase(), x.toLowerCase()])))
    .slice(0, 10); // Firestore 'in' limit
}
function pickMarkContainer(data: any) {
  // Try multiple common field names
  return (
    data?.marks ??
    data?.MARKS ??
    data?.attendance ??
    data?.Attendance ??
    data?.ATTENDANCE ??
    data?.records ??
    data?.data ??
    data?.students ??
    null
  );
}
function pickMarkInfo(marks: any, roll: string, email?: string) {
  if (!marks) return null;
  const r = String(roll).trim();
  const tries = [
    r,
    r.toUpperCase(),
    r.toLowerCase(),
    r.replace(/\s+/g, ""),
    r.toUpperCase().replace(/\s+/g, ""),
  ];
  // map-like
  for (const k of tries) if (marks[k] != null) return marks[k];
  if (email && marks[email]) return marks[email];
  // array-like
  if (Array.isArray(marks)) {
    const U = r.toUpperCase();
    return (
      marks.find((m: any) => {
        const key =
          m?.rollno ??
          m?.ROLLNO ??
          m?.regno ??
          m?.REGNO ??
          m?.id ??
          m?.ID ??
          m?.email ??
          m?.EMAIL;
        return String(key || "").trim().replace(/\s+/g, "").toUpperCase() === U ||
               (email && String(key || "").trim().toLowerCase() === String(email).toLowerCase());
      }) || null
    );
  }
  return null;
}
function markToDotColor(info: any) {
  const v =
    info?.present ??
    info?.P ??
    info?.p ??
    info?.status ??
    info?.STATUS ??
    info?.value ??
    info?.VALUE;
  if (v === true || v === 1 || v === "1" || v === "P" || String(v).toLowerCase() === "present")
    return "green";
  if (info?.absent === true || v === 0 || v === "0" || v === "A" || String(v).toLowerCase() === "absent")
    return "red";
  return "grey";
}

/* -------------------------------- component ------------------------------- */
export default function StudentDashboard() {
  const router = useRouter();

  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [pfpUri, setPfpUri] = useState<string | null>(null);
  const [shownAY, setShownAY] = useState<string>(getAcademicYear()); // may fall back

  // photo
  useEffect(() => {
    let unsub: undefined | (() => void);
    const isHttpUrl = (s?: string | null) => !!s && /^https?:\/\//i.test(s);
    const upscaleGooglePhoto = (url: string) =>
      url.replace(/=s\d+-c\b/, "=s240-c");

    const setPhotoFor = async (user: any) => {
      if (!user) {
        setPfpUri(null);
        return;
      }
      let url: string | null =
        user.photoURL ||
        user.providerData?.find((p: any) => p?.photoURL)?.photoURL ||
        null;
      if (isHttpUrl(url)) {
        setPfpUri(upscaleGooglePhoto(url!));
        return;
      }
      if (user.email) {
        const email = String(user.email).trim().toLowerCase();
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.MD5,
          email
        );
        setPfpUri(`https://www.gravatar.com/avatar/${hash}?d=identicon&s=240`);
        return;
      }
      setPfpUri(null);
    };

    setPhotoFor(auth.currentUser);
    unsub = onAuthStateChanged(auth, setPhotoFor);
    return () => { if (unsub) unsub(); };
  }, []);

  // roster + attendance
  useEffect(() => {
    const run = async () => {
      try {
        const u = auth.currentUser;
        const e = u?.email?.trim().toLowerCase();
        if (!e || !e.endsWith("@citchennai.net")) {
          setLoading(false);
          return;
        }

        // roster (pick most recent / current)
        const qStu = query(collection(db, "students"), where("EMAIL", "==", e));
        const snapStu = await getDocs(qStu);
        if (snapStu.empty) throw new Error("Student not found");

        const candidates: any[] = [];
        snapStu.forEach((d) => candidates.push(d.data()));
        const stu = pickBestStudentDoc(candidates);
        if (!stu?.ROLLNO || !stu?.CLASS)
          throw new Error("Roster entry incomplete. Contact mentor.");
        const studentWithYr = { ...stu, _DERIVED_YEAR: extractYear(stu) };
        setStudent(studentWithYr);

        const roll = String(stu.ROLLNO).trim();
        const email = String(stu.EMAIL || e).trim();
        const variants = classVariants(stu.CLASS);
        const currentAY = getAcademicYear();

        /* 1) current AY + class variants */
        let docs: any[] = [];
        for (const batch of [variants.slice(0, 10)]) {
          const q1 = query(
            collection(db, "attendance"),
            where("CLASS", "in", batch),
            where("ACADEMIC_YEAR", "==", currentAY)
          );
          const s1 = await getDocs(q1);
          if (!s1.empty) docs.push(...s1.docs);
        }

        /* 2) if none, current AY only (we’ll filter class client-side) */
        let effectiveAY = currentAY;
        if (docs.length === 0) {
          const q2 = query(collection(db, "attendance"), where("ACADEMIC_YEAR", "==", currentAY));
          const s2 = await getDocs(q2);
          if (!s2.empty) docs.push(...s2.docs);
        }

        /* 3) if still none, fetch ALL docs (small datasets are fine) */
        if (docs.length === 0) {
          const s3 = await getDocs(collection(db, "attendance"));
          if (!s3.empty) docs.push(...s3.docs);
        }

        const base = normalizeClassBase(stu.CLASS);
        const filterByClass = (val: any) => {
          const c = val?.CLASS ?? val?.class ?? val?.Class;
          if (!c) return false;
          return normalizeClassBase(String(c)) === base;
        };

        // If we fetched AY-only or ALL, restrict by class now
        if (docs.length) {
          const anyExact = docs.filter(d => filterByClass(d.data()));
          if (anyExact.length) docs = anyExact;
        }

        if (DEBUG) console.log("[attendance] docs fetched:", docs.length);

        // Build marks map
        const out: Record<string, any> = {};
        let minD: Date | null = null, maxD: Date | null = null;

        docs.forEach((ds) => {
          const data: any = ds.data();

          // choose AY to show if we ended up grabbing ALL docs
const dRaw = data?.DATE ?? data?.Date ?? data?.date;
const d = parseDateToJs(dRaw);
const key = toLocalDateKey(dRaw);
if (!d || !key) return;

const cont = pickMarkContainer(data);
const info = pickMarkInfo(cont, roll, email);
if (!info) return;

const color = markToDotColor(info) || "grey";
if (!out[key] || (out[key].dotColor === "grey" && color !== "grey")) {
  out[key] = { marked: true, dotColor: color };
}


          // Only keep days inside some AY (prefer current AY, otherwise the AY the date belongs to)
          const ayForDate = (() => {
            const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
            return `${y}-${y + 1}`;
          })();

          // If we didn’t find anything for currentAY, we’ll use the AY of the latest date at the end.
          if (!dateInAY(d, effectiveAY)) {
            // store for potential fallback selection
          }

          if (!minD || d < minD) minD = d;
          if (!maxD || d > maxD) maxD = d;

          // If we previously had no docs, set AY to the AY of the latest date
          effectiveAY = ayForDate;
        });

        if (DEBUG) console.log("[attendance] days:", Object.keys(out).length, "AY:", effectiveAY, "range:", minD, maxD);

        setAttendance(out);
        setShownAY(effectiveAY);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // UI numbers
  const presentDays = Object.values(attendance).filter((v: any) => v.dotColor === "green").length;
  const absentDays = Object.values(attendance).filter((v: any) => v.dotColor === "red").length;
  const totalDays = presentDays + absentDays;
  const attendancePct = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
  const pctColor = (p: number) => (p >= 75 ? "#16a34a" : p >= 65 ? "#f59e0b" : "#ef4444");

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      console.log("Sign-out error:", e);
    }
  };

  if (loading) return <ActivityIndicator size="large" color="blue" />;

  if (!student)
    return (
      <View style={styles.center}>
        <Text>No student record found</Text>
      </View>
    );

  const displayClass = (() => {
    const s = String(student.CLASS || "").trim();
    if (/\byear\s*[1-4]\b/i.test(s)) return s;
    return student?._DERIVED_YEAR ? `${s} (Year ${student._DERIVED_YEAR})` : s;
  })();

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.headerWrap}>
        <Text style={styles.title}>Student Dashboard</Text>
        <Text style={styles.subTitle}>Welcome back! Here&apos;s your attendance overview</Text>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutTxt}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Top */}
      <View style={styles.topGrid}>
        {/* Profile */}
        <View style={[styles.card, styles.shadow]}>
          <View style={[styles.cardBody, { alignItems: "center" }]}>
            <View style={styles.avatarWrap}>
              {pfpUri ? (
                <Image key={pfpUri} source={{ uri: pfpUri }} style={styles.avatar} resizeMode="cover" onError={() => setPfpUri(null)} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: "#9ca3af", fontWeight: "800", fontSize: 24 }}>
                    {(student?.NAME || "S").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.nameTxt}>{student.NAME || "Student"}</Text>
            <Text style={styles.greyTxt}>Computer Science Engineering</Text>
          </View>
        </View>

        {/* Info */}
        <View style={[styles.card, styles.shadow, { flex: 2 }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Student Information</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.infoGrid}>
              <InfoPill label="Full Name" value={student.NAME || "-"} bgFrom="#eff6ff" bgTo="#dbeafe" />
              <InfoPill label="Register Number" value={student.ROLLNO || "-"} bgFrom="#f5f3ff" bgTo="#ede9fe" />
              <InfoPill label="Department" value={displayClass} bgFrom="#ecfdf5" bgTo="#d1fae5" />
              <InfoPill label="Academic Year" value={getAcademicYear()} bgFrom="#fff7ed" bgTo="#ffedd5" />
            </View>
          </View>
        </View>
      </View>

      {/* Bottom */}
      <View style={styles.bottomGrid}>
        {/* Ring */}
        <View style={[styles.card, styles.shadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Attendance</Text>
          </View>
          <View style={[styles.cardBody, { alignItems: "center" }]}>
            <Ring percent={attendancePct} color={pctColor(attendancePct)} />
            <Text style={[styles.ringPct, { color: pctColor(attendancePct), marginTop: 8 }]}>{attendancePct}%</Text>
            <View style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={styles.greyTxt}>{presentDays} of {totalDays} days present</Text>
              <Text style={[styles.hintTxt, { marginTop: 4 }]}>Minimum required: 75% {attendancePct < 75 ? "⚠️" : ""}</Text>
              {attendancePct < 75 && (
                <View style={styles.badgeDanger}>
                  <Text style={styles.badgeDangerTxt}>Below Threshold</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Calendar */}
        <View style={[styles.card, styles.shadow, { flex: 1.7 }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Attendance Calendar</Text>
          </View>

          <View style={[styles.legendRow, { paddingHorizontal: 16, alignItems: "center" }]}>
            <LegendDot color="#22c55e" label="Present" />
            <LegendDot color="#ef4444" label="Absent" />
            <LegendDot color="#9ca3af" label="No Class" />
            {shownAY !== getAcademicYear() && (
              <Text style={[styles.hintTxt, { marginLeft: 8 }]}>Showing {shownAY} (no records for {getAcademicYear()})</Text>
            )}
          </View>

          <View style={{ padding: 8 }}>
            <Calendar
              markingType="dot"
              markedDates={attendance}
              dayComponent={({ date }) => {
                const ds = date?.dateString;
                const dot = ds ? (attendance as any)[ds]?.dotColor : null;
                const bg = dot === "green" ? "#22c55e" : dot === "red" ? "#ef4444" : "#f3f4f6";
                const textColor = dot ? "#fff" : "#374151";
                return (
                  <View style={styles.dayCell}>
                    <View style={[styles.daySquare, { backgroundColor: bg }]}>
                      <Text style={[styles.dayTxt, { color: textColor }]}>{date?.day}</Text>
                    </View>
                  </View>
                );
              }}
              style={{ borderRadius: 12 }}
              theme={{ textDayFontWeight: "600", textMonthFontWeight: "800", arrowColor: "#1d4ed8" }}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/* --------------------------- tiny presentational -------------------------- */
const InfoPill = ({
  label,
  value,
  bgFrom,
  bgTo,
}: {
  label: string;
  value: string;
  bgFrom: string;
  bgTo: string;
}) => (
  <View style={[styles.pill, { backgroundColor: bgTo }]}>
    <Text style={styles.pillLabel}>{label}</Text>
    <Text style={styles.pillValue}>{value}</Text>
  </View>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16 }}>
    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
    <Text style={{ marginLeft: 6, color: "#374151" }}>{label}</Text>
  </View>
);

// circular progress ring (SVG)
const Ring = ({ percent, color }: { percent: number; color: string }) => {
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = c * (percent / 100);
  return (
    <View style={{ width: 130, height: 130, alignItems: "center", justifyContent: "center" }}>
      <Svg width={130} height={130} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={65} cy={65} r={r} stroke="#e5e7eb" strokeWidth={10} fill="none" />
        <Circle
          cx={65}
          cy={65}
          r={r}
          stroke={color}
          strokeWidth={10}
          fill="none"
          strokeDasharray={`${c}`}
          strokeDashoffset={`${c - dash}`}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
};

/* ---------------------------------- styles --------------------------------- */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f8fafc" },
  headerWrap: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, alignItems: "center" },
  title: { fontSize: 26, fontWeight: "800", color: "#1f2937" },
  subTitle: { color: "#6b7280", marginTop: 6, textAlign: "center" },
  signOutBtn: { position: "absolute", right: 16, top: 16, backgroundColor: "#ef4444", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  signOutTxt: { color: "#fff", fontWeight: "700" },
  topGrid: { flexDirection: "row", gap: 12, paddingHorizontal: 12, marginTop: 8 },
  bottomGrid: { flexDirection: "row", gap: 12, paddingHorizontal: 12, marginTop: 12 },
  card: { flex: 1, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 16, borderWidth: 0, overflow: "hidden" },
  shadow: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  cardHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1f2937" },
  cardBody: { padding: 16 },
  hintTxt: { fontSize: 12, color: "#6B7280" },
  badgeDanger: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#fee2e2", borderRadius: 8, borderWidth: 1, borderColor: "#fecaca" },
  badgeDangerTxt: { color: "#991b1b", fontSize: 12, fontWeight: "700" },
  avatarWrap: { width: 120, height: 120, borderRadius: 60, borderWidth: 4, borderColor: "#fff", overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, marginBottom: 12 },
  avatar: { width: "100%", height: "100%" },
  avatarEdit: { position: "absolute", bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  nameTxt: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  greyTxt: { color: "#6b7280" },
  infoGrid: { gap: 10 },
  pill: { padding: 12, borderRadius: 12 },
  pillLabel: { fontSize: 12, color: "#6b7280", marginBottom: 2 },
  pillValue: { fontSize: 15, color: "#1f2937", fontWeight: "700" },
  legendRow: { flexDirection: "row", alignItems: "center", marginTop: 6, marginBottom: 6 },
  dayCell: { width: 46, height: 46, padding: 4, alignItems: "center", justifyContent: "center" },
  daySquare: { width: "100%", height: "100%", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  dayTxt: { fontWeight: "700" },
  ringPct: { fontSize: 22, fontWeight: "800" },
  calendar: { marginTop: 8 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
