// app/student_dashboard.tsx
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { auth, db } from '../../firebase';
import ButterflyTrail from '@/components/ButterflyTrail'
export default function StudentDashboard() {
  const [student, setStudent] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (!user?.email?.endsWith("@citchennai.net")) {
          setLoading(false);
          return;
        }

        // STEP 1: Find student record
        const q = query(
          collection(db, "students"),
          where("EMAIL", "==", user.email)
        );
        const studentSnap = await getDocs(q);

        if (studentSnap.empty) throw new Error("Student not found");

        const studentData = studentSnap.docs[0].data();
        setStudent(studentData);

        // STEP 2: Get attendance docs for that class
        const attSnap = await getDocs(collection(db, "attendance"));
        const marks: any = {};

        attSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.CLASS === studentData.CLASS) {
            const roll = studentData.ROLLNO;
            const markInfo = data.marks?.[roll];
            if (markInfo) {
              const date = data.DATE; // "2025-08-18"
              if (markInfo.present) {
                marks[date] = { marked: true, dotColor: "green" };
              } else if (markInfo.absent) {
                marks[date] = { marked: true, dotColor: "red" };
              }
            }
          }
        });

        setAttendance(marks);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <ActivityIndicator size="large" color="blue" />;

  if (!student)
    return (
      <View style={styles.center}>
        <Text>No student record found</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{student.NAME}</Text>
      <Text>Reg No: {student.ROLLNO}</Text>
      <Text>Class: {student.CLASS}</Text>

      <Calendar
        markingType="dot"
        markedDates={attendance}
        style={styles.calendar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  calendar: { marginTop: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
