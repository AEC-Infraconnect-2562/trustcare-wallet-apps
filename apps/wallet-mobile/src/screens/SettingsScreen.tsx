import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Shield, Trash2 } from "lucide-react-native";
import { useNativeLanguage } from "@trustcare/i18n/src/provider.native";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { useMobileSecuritySettings } from "../hooks/useMobileSecuritySettings";
import { clearRefreshToken } from "../storage/secureSession";
import { clearOfflineWallet } from "../storage/offlineWallet";

export function SettingsScreen() {
  const { user, users, setActiveUserId, resetActiveUser } = useActiveWalletUser();
  const { lang, setLang } = useNativeLanguage();
  const security = useMobileSecuritySettings();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>ตั้งค่า</Text>
      <View style={styles.userPanel}>
        <Text style={styles.sectionLabel}>ผู้ใช้ทดสอบ</Text>
        <Text style={styles.desc}>เลือกผู้ใช้โดยไม่ต้องใช้รหัสผ่านในช่วงพัฒนา ข้อมูลใน Wallet จะแยกตาม scope ของผู้ใช้ที่เลือก</Text>
        {users.map(item => {
          const active = item.id === user.id;
          return (
            <Pressable key={item.id} style={[styles.userRow, active && styles.userRowActive]} onPress={() => void setActiveUserId(item.id)}>
              <View style={styles.userAvatar}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.userAvatarImage} /> : <Text style={styles.userAvatarText}>{item.initials}</Text>}
              </View>
              <View style={styles.userCopy}>
                <Text style={styles.userName}>{item.nameTh}</Text>
                <Text style={styles.userMeta}>{item.role === "staff" ? "เจ้าหน้าที่" : "ผู้ป่วย"} · {item.sourceLabel}</Text>
              </View>
              {active && <Text style={styles.activeBadge}>ใช้งาน</Text>}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>Biometric gate</Text><Text style={styles.desc}>ยืนยันตัวตนก่อนแสดง QR และรายละเอียดสำคัญ</Text></View>
        <Switch value={security.biometricEnabled} onValueChange={(enabled) => void security.setBiometricEnabled(enabled)} />
      </View>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>ป้องกันการบันทึกหน้าจอ</Text><Text style={styles.desc}>ลดความเสี่ยงจาก screenshot บนหน้าข้อมูลสำคัญ</Text></View>
        <Switch value={security.screenCaptureProtectionEnabled} onValueChange={(enabled) => void security.setScreenCaptureProtectionEnabled(enabled)} />
      </View>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>ภาษา</Text><Text style={styles.desc}>สลับภาษา UI ระหว่างไทยและอังกฤษสำหรับหน้าที่ใช้ i18n</Text></View>
        <Pressable style={styles.segmentButton} onPress={() => setLang(lang === "th" ? "en" : "th")}>
          <Text style={styles.segmentText}>{lang.toUpperCase()}</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <View style={styles.copy}><Text style={styles.name}>ธีม</Text><Text style={styles.desc}>บันทึกโหมดธีมและใช้กับ navigation surface ของ mobile wallet</Text></View>
        <Pressable style={styles.segmentButton} onPress={() => void security.setTheme(security.theme === "light" ? "dark" : "light")}>
          <Text style={styles.segmentText}>{security.theme === "light" ? "LIGHT" : "DARK"}</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.danger}
        onPress={() => {
          void clearRefreshToken();
          void clearOfflineWallet();
          void resetActiveUser();
        }}
      >
        <Trash2 color="#991b1b" />
        <Text style={styles.dangerText}>ออกจากระบบทดสอบและล้าง cache</Text>
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
  title: { fontSize: 27, fontWeight: "700", color: "#111827", marginBottom: 8 },
  userPanel: { borderRadius: 14, backgroundColor: "#fff", padding: 14, gap: 10, borderWidth: 1, borderColor: "#d8dfe4" },
  sectionLabel: { color: "#111827", fontSize: 16, fontWeight: "700" },
  userRow: { minHeight: 64, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#fff", padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  userRowActive: { borderColor: "#b9c5ff", backgroundColor: "#f2f5ff" },
  userAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#4f67f2", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  userAvatarImage: { width: 42, height: 42 },
  userAvatarText: { color: "#fff", fontWeight: "700" },
  userCopy: { flex: 1 },
  userName: { color: "#111827", fontWeight: "700", fontSize: 14.5 },
  userMeta: { color: "#62718a", marginTop: 2, fontSize: 12 },
  activeBadge: { color: "#0b6b42", backgroundColor: "#dcfce7", overflow: "hidden", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontWeight: "700", fontSize: 12 },
  row: { borderRadius: 12, backgroundColor: "#fff", padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderColor: "#d8dfe4" },
  copy: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: "#111827" },
  desc: { color: "#62718a", marginTop: 4, flex: 1, lineHeight: 20 },
  segmentButton: { minWidth: 76, minHeight: 42, borderRadius: 21, backgroundColor: "#eef3ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  segmentText: { color: "#4f67f2", fontWeight: "800" },
  danger: { borderRadius: 12, backgroundColor: "#fee2e2", padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  dangerText: { color: "#991b1b", fontWeight: "700" },
  note: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }
});
