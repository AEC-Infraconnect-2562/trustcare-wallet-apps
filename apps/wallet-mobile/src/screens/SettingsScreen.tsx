import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Shield, Trash2 } from "lucide-react-native";
import { clearRefreshToken } from "../storage/secureSession";
import { clearOfflineWallet } from "../storage/offlineWallet";

export function SettingsScreen() {
  const [biometric, setBiometric] = useState(true);
  const [capture, setCapture] = useState(true);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ตั้งค่า</Text>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>Biometric gate</Text><Text style={styles.desc}>ยืนยันตัวตนก่อนแสดง QR และรายละเอียดสำคัญ</Text></View>
        <Switch value={biometric} onValueChange={setBiometric} />
      </View>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>ป้องกันการบันทึกหน้าจอ</Text><Text style={styles.desc}>ลดความเสี่ยงจาก screenshot บนหน้าข้อมูลสำคัญ</Text></View>
        <Switch value={capture} onValueChange={setCapture} />
      </View>
      <Pressable
        style={styles.danger}
        onPress={() => {
          void clearRefreshToken();
          void clearOfflineWallet();
        }}
      >
        <Trash2 color="#991b1b" />
        <Text style={styles.dangerText}>ล้าง token และ offline cache</Text>
      </Pressable>
      <View style={styles.note}>
        <Shield color="#0b6b42" />
        <Text style={styles.desc}>Mobile app ใช้ SecureStore สำหรับ refresh token และ SQLite สำหรับ wallet cache ในเครื่อง</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 12 },
  title: { fontSize: 30, fontWeight: "900", color: "#111827", marginBottom: 8 },
  row: { borderRadius: 12, backgroundColor: "#fff", padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderColor: "#d8dfe4" },
  copy: { flex: 1 },
  name: { fontSize: 16, fontWeight: "900", color: "#111827" },
  desc: { color: "#62718a", marginTop: 4, flex: 1, lineHeight: 20 },
  danger: { borderRadius: 12, backgroundColor: "#fee2e2", padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  dangerText: { color: "#991b1b", fontWeight: "900" },
  note: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }
});
