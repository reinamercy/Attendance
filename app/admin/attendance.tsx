//app/admin/attendance.tsx//-----------------------------------------------------------------------------------------------------------------------------------
import { Buffer } from 'buffer';
(global as any).Buffer = Buffer

import Checkbox from 'expo-checkbox';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// IMPORTANT: style-aware XLSX//-----------------------------------------------------------------------------------------------------------------------------------
import XLSX from 'xlsx-js-style';

import dayjs from 'dayjs';
import { Calendar } from 'react-native-calendars';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';

interface Student {
  key: string
  NAME: string
  ROLLNO: string
  EMAIL: string
  CLASS: string
  present: boolean
  absent: boolean
  mentor?: string
}

export default function AdminAttendance() {
  const { cls, mentor } = useLocalSearchParams<{ cls: string; mentor: string }>()
  const router = useRouter()

  const [students, setStudents] = useState<Student[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRoll, setNewRoll] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [success, setSuccess] = useState(false)

  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [savingDay, setSavingDay] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  // Load roster for this class//-----------------------------------------------------------------------------------------------------------------------------------
  useEffect(() => {
    const fetchStudents = async () => {
      if (!cls) return
      const qy = query(collection(db, 'students'), where('CLASS', '==', cls))
      const snapshot = await getDocs(qy)
      const loaded = snapshot.docs.map(d => ({
        ...(d.data() as any),
        key: d.id
      })) as Student[]
      
      setStudents(loaded)
    }
    fetchStudents()
  }, [cls])

  useFocusEffect(
    React.useCallback(() => {
      setSelectedDate(dayjs().format('YYYY-MM-DD'))
    }, [])
  )

  const loadAttendanceForDate = async () => {
    if (!cls || students.length === 0) return
    const id = `${cls}__${selectedDate}`
    const ref = doc(db, 'attendance', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      setStudents(prev => prev.map(s => ({ ...s, present: false, absent: false })))
      return
    }
    const data = snap.data() as any
    const marks = data?.marks || {}
    setStudents(prev =>
      prev.map(s => {
        const byRoll = marks[s.ROLLNO] || {}
        return { ...s, present: !!byRoll.present, absent: !!byRoll.absent }
      })
    )
  }

  useEffect(() => {
    if (students.length) loadAttendanceForDate()

  }, [selectedDate, students.length])

  // Save roster-----------------------------------------------------------------------------------------------------------------------------------------
  const saveStudents = async () => {
    const qy = query(collection(db, 'students'), where('CLASS', '==', cls))
    const snapshot = await getDocs(qy)
    for (let d of snapshot.docs) {
      await deleteDoc(doc(db, 'students', d.id))
    }
    for (let stu of students) {
      const { key, ...data } = stu
      await addDoc(collection(db, 'students'), { ...data, mentor })
    }
    setSuccess(true)
    setTimeout(() => {
      setSuccess(false)
      router.replace({ pathname: '/admin/dashboard', params: { mentor } })
    }, 1200)
  }

  // Save per-day attendance-----------------------------------------------------------------------------------------------------------------------------------------
  const saveAttendanceForDate = async () => {
    if (!cls) return
    setSavingDay(true)
    try {
      const marks: Record<string, { present: boolean; absent: boolean }> = {}
      for (const s of students) {
        marks[s.ROLLNO] = { present: !!s.present, absent: !!s.absent }
      }
      const id = `${cls}__${selectedDate}`
      const ref = doc(db, 'attendance', id)
      await setDoc(ref, {
        CLASS: cls,
        DATE: selectedDate,
        mentor: mentor ?? '',
        updatedAt: Date.now(),
        marks
      })
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 1000)
    } catch {
      Alert.alert('Save failed', 'Could not save attendance for this date.')
    } finally {
      setSavingDay(false)
    }
  }

  // Excel export -----------------------------------------------------------------------------------------------------------------------------------------
  const downloadAttendanceExcel = () => {
    if (!students.length) {
      Alert.alert('No data', 'No students to export.')
      return
    }

    const rows: any[][] = [
      ['SNO', 'NAME', 'ROLLNO', 'EMAIL', 'CLASS', 'DATE', 'Present', 'Absent']
    ]
    students.forEach((s, idx) => {
      rows.push([
        idx + 1,
        s.NAME,
        s.ROLLNO,
        s.EMAIL,
        s.CLASS,
        selectedDate,
        s.present ? 'P' : '',
        s.absent ? 'A' : ''
      ])
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(rows)

    ;(ws as any)['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 12 }, { wch: 26 },
      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }
    ]

    // Header bold------------------------------------------------------------------------------------------------------------------------------------------
    const header = ['A1','B1','C1','D1','E1','F1','G1','H1']
    header.forEach(addr => {
      if ((ws as any)[addr]) {
        ;(ws as any)[addr].s = {
          font: { bold: true },
          alignment: { horizontal: 'center', vertical: 'center' }
        }
      }
    })

    students.forEach((s, idx) => {
      const r = idx + 2
      const presentAddr = `G${r}`
      const absentAddr  = `H${r}`

      if ((ws as any)[presentAddr] && s.present) {
        ;(ws as any)[presentAddr].s = {
          fill: { patternType: 'solid', fgColor: { rgb: '92D050' } }, // green
          font: { color: { rgb: 'FFFFFF' }, bold: true },
          alignment: { horizontal: 'center' }
        }
      }
      if ((ws as any)[absentAddr] && s.absent) {
        ;(ws as any)[absentAddr].s = {
          fill: { patternType: 'solid', fgColor: { rgb: 'FF0000' } }, // red
          font: { color: { rgb: 'FFFFFF' }, bold: true },
          alignment: { horizontal: 'center' }
        }
      }
    })

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')

    // Web download--------------------------------------------------------------------------------------------------------------------------------------------
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    if (Platform.OS === 'web') {
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${cls || 'class'}_${selectedDate}_attendance.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      Alert.alert('Download', 'Web download ready. For native, we can add FileSystem + Share next.')
    }
  }

  // Import Excel (native)-----------------------------------------------------------------------------------------------------------------------------------
  const importExcelNative = async () => {
    const res = (await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true
    })) as any
    if (res.type === 'cancel') return
    const name = res.name ?? ''
    if (!name.toLowerCase().endsWith('.xlsx')) {
      return Alert.alert('Invalid file', 'Please select a .xlsx file')
    }
    try {
      const uri: string = res.uri
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      })
      const wb = XLSX.read(b64, { type: 'base64' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<any>(ws)
      setStudents(
        data.map((d, i) => ({
          key: `${Date.now()}-${i}`,
          NAME: d.NAME ?? '',
          ROLLNO: d.ROLLNO ?? '',
          EMAIL: d.EMAIL ?? '',
          CLASS: d.CLASS ?? cls ?? '',

          //DATE: d.CLASS ?? cls ?? "",
          present: false,
          absent: false,
          mentor: mentor ?? ''
        }))
      )
    } catch {
      Alert.alert('Parse error', 'Could not parse this file.')
    }
  }

  const handleWebFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return Alert.alert('Invalid file', 'Please select a .xlsx file')
    }
    const reader = new FileReader()
    reader.onload = ev => {
      const b64 = (ev.target?.result as string).split(',')[1]
      try {
        const wb = XLSX.read(b64, { type: 'base64' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<any>(ws)
        setStudents(
          data.map((d, i) => ({
            key: `${Date.now()}-${i}`,
            NAME: d.NAME ?? '',
            ROLLNO: d.ROLLNO ?? '',
            EMAIL: d.EMAIL ?? '',
            CLASS: d.CLASS ?? cls ?? '',
            present: false,
            absent: false,
            mentor: mentor ?? ''
          }))
        )
      } catch {
        Alert.alert('Parse error', 'Could not parse this file.')
      }
    }
    reader.readAsDataURL(file)
  }

  const toggle = (key: string, field: 'present' | 'absent') =>
    setStudents(prev =>
      prev.map(s =>
        s.key === key
          ? {
              ...s,
              [field]: !s[field],
            //  ... (field === "absent ? { present: false } : { absent: false }),")
              ...(field === 'present' ? { absent: false } : { present: false })
            }
          : s
      )
    )
  const deleteStudent = (key: string) => setStudents(prev => prev.filter(s => s.key !== key))
  const confirmAddStudent = () => {
    if (!newName.trim() || !newRoll.trim() || !newEmail.trim()) return
    const student: Student = {
      key: `${Date.now()}`,
      NAME: newName.trim(),
      ROLLNO: newRoll.trim(),
      EMAIL: newEmail.trim(),
      CLASS: cls ?? '',
      present: false,
      absent: false,
      mentor: mentor ?? ''
    }
    setStudents(prev => [...prev, student])
    setNewName('')
    setNewRoll('')
    setNewEmail('')
    setShowAddModal(false)
  }
  const COLUMNS = ['SNO', 'NAME', 'ROLLNO', 'EMAIL', 'CLASS', 'Present', 'Absent', 'Del']
  return (
    <SafeAreaView style={s.container}>

      <View style={s.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={s.topText}>Class: {cls}</Text>
          <Text style={s.topText}>Mentor: {mentor}</Text>
        </View>

        <View style={s.topActions}>
          {Platform.OS === 'web' ? (
            <>
              <input
                id="filepicker"
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleWebFile}
              />
              <TouchableOpacity
                style={s.importBtn}
                onPress={() => document.getElementById('filepicker')!.click()}
              >
                <Text style={s.importTxt}>Import Excel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={s.importBtn} onPress={importExcelNative}>
              <Text style={s.importTxt}>Import Excel</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={s.todayTopBtn}
            onPress={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))}
          >
            <Text style={{ fontWeight: '600' }}>Today</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >

        <View style={{ paddingHorizontal: 12, paddingTop: 6 }}>
          <Calendar
            markedDates={{ [selectedDate]: { selected: true } }}
            onDayPress={d => setSelectedDate(d.dateString)}
            enableSwipeMonths
            style={s.calendarBox}
            theme={{
              textMonthFontSize: 16,
              textDayFontSize: 12,
              textDayHeaderFontSize: 12
            }}
          />
        </View>


        <TouchableOpacity
          style={[s.saveDayBtn, savingDay && { opacity: 0.6 }]}
          onPress={saveAttendanceForDate}
          disabled={savingDay}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>
            Save Attendance ({selectedDate})
          </Text>
        </TouchableOpacity>

   
        <ScrollView horizontal showsHorizontalScrollIndicator style={s.grid}>
          <View>
            <View style={s.rowHeader}>
              {COLUMNS.map(col => (
                <View key={col} style={[s.cell, s.headerCell]}>
                  <Text style={s.headerText}>{col}</Text>
                </View>
              ))}
            </View>
            {students.map((stu, idx) => (
              <View key={stu.key} style={s.row}>
                <View style={s.cell}><Text>{idx + 1}</Text></View>
                <View style={s.cell}><Text>{stu.NAME}</Text></View>
                <View style={s.cell}><Text>{stu.ROLLNO}</Text></View>
                <View style={s.cell}><Text>{stu.EMAIL}</Text></View>
                <View style={s.cell}><Text>{stu.CLASS}</Text></View>
                <View style={s.cell}>
                  <Checkbox value={stu.present} onValueChange={() => toggle(stu.key, 'present')} />
                </View>
                <View style={s.cell}>
                  <Checkbox value={stu.absent} onValueChange={() => toggle(stu.key, 'absent')} />
                </View>
                <View style={s.cell}>
                  <TouchableOpacity onPress={() => deleteStudent(stu.key)}>
                    <Text style={s.deleteTxt}>Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={s.bottomBar}>
          <TouchableOpacity style={s.saveRosterBtn} onPress={saveStudents}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.downloadBtn} onPress={downloadAttendanceExcel}>
            <Text style={s.downloadTxt}>Download Attendance</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TouchableOpacity style={s.fab} onPress={() => setShowAddModal(true)}>
        <Text style={s.fabTxt}>＋</Text>
      </TouchableOpacity>

      <Modal visible={savedTick} transparent animationType="fade">
        <View style={s.centerFade}>
          <View style={s.tickCard}>
            <Text style={{ fontSize: 42, color: '#22c55e' }}>✓</Text>
            <Text style={{ marginTop: 6, fontWeight: '600' }}>Attendance saved</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={success} transparent animationType="fade">
        <View style={s.centerFade}>
          <View style={s.savedCard}>
            <Text style={{ fontSize: 44, color: '#33c24d', fontWeight: 'bold' }}>✓</Text>
            <Text style={{ fontWeight: 'bold', color: '#4e44ce', marginTop: 8 }}>Saved!</Text>
          </View>
        </View>
      </Modal>
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={s.modalBg}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add New Student</Text>
            <TextInput placeholder="Name" value={newName} onChangeText={setNewName} style={s.input} />
            <TextInput placeholder="Roll No" value={newRoll} onChangeText={setNewRoll} style={s.input} />
            <TextInput placeholder="Email ID" value={newEmail} onChangeText={setNewEmail} style={s.input} />
            <Text style={s.static}>Class: {cls}</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtn} onPress={confirmAddStudent}>
                <Text style={s.modalBtnTxt}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.cancel]} onPress={() => setShowAddModal(false)}>
                <Text style={s.modalBtnTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
//----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fafafa'
  },
  topText: { marginRight: 16, fontWeight: 'bold' },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  importBtn: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#4e44ce', borderRadius: 4, marginLeft: 8 },
  importTxt: { color: '#fff' },
  todayTopBtn: { marginLeft: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#e5e7eb' },

  calendarBox: {
    width : 1300 , 
    marginHorizontal: 4,
    borderRadius: 8,
    overflow: 'hidden',
    transform: [{ scale: 1.1 }],
    alignSelf: 'center'
  },
  saveDayBtn: { backgroundColor: '#0ea5e9', padding: 12, borderRadius: 6, marginHorizontal: 16, marginTop: 10, alignSelf: 'flex-end' },
  grid: { flex: 1 },
  rowHeader: { flexDirection: 'row', backgroundColor: '#eee', borderBottomWidth: 1, borderColor: '#ccc' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#ddd' },
  cell: { flex: 1, minWidth: 242, padding: 8, borderRightWidth: 1, borderColor: '#ccc' },
  headerCell: { backgroundColor: '#ddd' },
  headerText: { fontWeight: 'bold', textAlign: 'center' },
  deleteTxt: { color: 'red' },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16
  },
  saveRosterBtn: { backgroundColor: '#4e44ce', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6 },
  downloadBtn: { backgroundColor: '#0ea5e9', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 6 },
  downloadTxt: { color: '#fff', fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4e44ce', alignItems: 'center', justifyContent: 'center' },
  fabTxt: { color: '#fff', fontSize: 32, lineHeight: 36 },
  centerFade: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  tickCard: { backgroundColor: '#fff', padding: 24, borderRadius: 16, alignItems: 'center' },
  savedCard: { backgroundColor: '#fff', borderRadius: 60, padding: 24, borderWidth: 2, borderColor: '#4e44ce', alignItems: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '80%', backgroundColor: '#fff', padding: 20, borderRadius: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 4, marginBottom: 12 },
  static: { padding: 10, backgroundColor: '#f0f0f0', borderRadius: 4, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtn: { flex: 1, padding: 12, backgroundColor: '#4d44cee3', borderRadius: 4, marginHorizontal: 4 },
  cancel: { backgroundColor: '#999' },
  modalBtnTxt: { color: '#fff', textAlign: 'center' }
})
