import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getDemoHistory } from "@trustcare/wallet-core";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";

export function HistoryScreen() {
  const { user } = useActiveWalletUser();
  const history = getDemoHistory(user.id);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>กิจกรรม</Text>
      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>ยังไม่มีกิจกรรม</Text>
          <Text style={styles.emptyBody}>
            เมื่อคุณแชร์เอกสารหรือถูกตรวจสอบ ประวัติการใช้งานจะแสดงที่นี่
            เพื่อให้ตรวจย้อนหลังได้ว่าข้อมูลถูกเปิดเมื่อไรและกับใคร
          </Text>
        </View>
      ) : (
        history.map((item) => (
          <View key={item.id} style={styles.row}>
            <View>
              <Text style={styles.name}>{item.verifierName}</Text>
              <Text style={styles.time}>
                {item.presentedAt
                  ? new Date(item.presentedAt).toLocaleString("th-TH")
                  : item.purpose}
              </Text>
            </View>
            <Text style={styles.badge}>{item.verificationResult}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 12 },
  title: { fontSize: 27, fontWeight: "700", color: "#111827", marginBottom: 8 },
  row: {
    minHeight: 78,
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: { fontSize: 16, fontWeight: "700", color: "#111827" },
  time: { color: "#62718a" },
  badge: { color: "#0b6b42", fontWeight: "700" },
  empty: {
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 28,
    gap: 8,
    alignItems: "center",
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  emptyBody: {
    fontSize: 13.5,
    lineHeight: 20,
    color: "#62718a",
    textAlign: "center",
  },
});
