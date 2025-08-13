import { useLocalSearchParams, useRouter } from 'expo-router'
import { signOut } from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, getDocs, query, where
} from 'firebase/firestore'
import React, { useEffect, useState } from 'react'
import {
  Alert, FlatList, Modal, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native'
import { auth, db } from '../../firebase'

type ClassItem = { id: string; name: string }

export default function AdminDashboard() {
  const router = useRouter()
  const { mentor: mentorParam } = useLocalSearchParams<{ mentor: string }>()
  const mentor = (mentorParam as string) || auth.currentUser?.email || ''

  const [classes, setClasses] = useState<ClassItem[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [department, setDepartment] = useState('')
  const [section, setSection] = useState('')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState<ClassItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    if (!mentor) return
    const qy = query(collection(db, 'classes'), where('mentor', '==', mentor))
    const snapshot = await getDocs(qy)
    setClasses(snapshot.docs.map(d => ({ id: d.id, name: (d.data() as any).name })))
  }

  useEffect(() => { refresh() }, [mentor])

  const addClass = async () => {
    if (!department.trim() || !section.trim()) return
    const name = `${department.trim()}-${section.trim()}`
    if (classes.some(c => c.name === name)) {
      setModalVisible(false); setDepartment(''); setSection(''); return
    }
    await addDoc(collection(db, 'classes'), { name, mentor, created: Date.now() })
    setModalVisible(false); setDepartment(''); setSection('')
    await refresh()
  }

  const performDelete = async (item: ClassItem) => {
    try {
      setBusyId(item.id)
      await deleteDoc(doc(db, 'classes', item.id))
      await refresh()
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message ?? 'Unknown error')
    } finally {
      
      setBusyId(null); setConfirmOpen(false); setPending(null)
    }
  }
  //const handleBack = () => {
  const askDelete = (item: ClassItem) => {
    if (Platform.OS === 'web') {
      setPending(item); setConfirmOpen(true)
    } else {
      Alert.alert('Delete Class', `Are you sure you want to delete "${item.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => performDelete(item) }
      ])
    }
  }
  
  const doSignOut = async () => {
    await signOut(auth)
    router.replace('/')
  }

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <TouchableOpacity onPress={doSignOut} style={{ padding: 8, backgroundColor: '#eee', borderRadius: 6 }}>
          <Text>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.mentor}>Logged in as: {mentor || '-'}</Text>
      {classes.length === 0 && <Text style={styles.noClasses}>No classes created yet.</Text>}

      <FlatList
        data={classes}
        keyExtractor={c => c.id}
        contentContainerStyle={classes.length === 0 ? { flex: 1, justifyContent: 'center', alignItems: 'center' } : undefined}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.classBtn, { flex: 1, marginRight: 8 }]}
              onPress={() => router.push({ pathname: '/admin/attendance', params: { cls: item.name, mentor } })}
            >
              <Text style={styles.classTxt}>{item.name}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, busyId === item.id && { opacity: 0.5 }]}
              disabled={busyId === item.id}
              onPress={() => askDelete(item)}
            >
              <Text style={styles.deleteTxt}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabTxt}>+ Create New Class</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Class</Text>
            <TextInput placeholder="Department (e.g. CSE)" value={department} onChangeText={setDepartment} style={styles.input}/>
            <TextInput placeholder="Section (e.g. C)" value={section} onChangeText={setSection} style={styles.input}/>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtn} onPress={addClass}>
                <Text style={styles.modalBtnTxt}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.cancel]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Delete Class</Text>
            <Text style={{ marginBottom: 12 }}>
              Are you sure you want to delete "{pending?.name}"?
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#e53935' }]} onPress={() => pending && performDelete(pending)}>
                <Text style={styles.modalBtnTxt}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.cancel]} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.modalBtnTxt}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  mentor: { fontSize: 16, marginBottom: 16, color: '#333' },
  noClasses: { textAlign: 'center', fontSize: 16, color: '#666' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  classBtn: { padding: 16, backgroundColor: '#4e44ce', borderRadius: 8 },
  classTxt: { color: '#fff', textAlign: 'center', fontSize: 18 },
  deleteBtn: { paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#e53935', borderRadius: 8 },
  deleteTxt: { color: '#fff', fontWeight: 'bold' },
  fab: { position: 'absolute', bottom: 20, left: 20, right: 20, padding: 16, backgroundColor: '#7874b3ff', borderRadius: 8 },
  fabTxt: { color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: 'bold' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '80%', backgroundColor: '#fff', padding: 20, borderRadius: 8 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 4, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtn: { flex: 1, padding: 12, backgroundColor: '#4e44ce', borderRadius: 4, marginHorizontal: 4 },
  cancel: { backgroundColor: '#999' },
  modalBtnTxt: { color: '#fff', textAlign: 'center', fontWeight: 'bold' }
  
})
