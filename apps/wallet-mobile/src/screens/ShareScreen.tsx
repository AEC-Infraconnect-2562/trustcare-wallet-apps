import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Camera, Link2, ShieldCheck } from "lucide-react-native";
import { router } from "expo-router";
import { getDemoShlPackages, shlAccessSummary } from "@trustcare/wallet-core";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";

export function ShareScreen() {
  const { user } = useActiveWalletUser();
  const shlPackages = getDemoShlPackages(user.id);
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>แชร์และตรวจสอบ</Text>
      <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
        <Camera color="#fff" />
        <Text style={styles.scanText}>สแกน QR Code</Text>
      </Pressable>
      {shlPackages.map(shl => (
        <View key={shl.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Link2 color="#4f67f2" />
            <Text style={styles.cardTitle}>{shl.label}</Text>
          </View>
          {shlAccessSummary(shl).map(line => <Text key={line} style={styles.line}>• {line}</Text>)}
          <View style={styles.bindings}>
            <ShieldCheck color="#0b6b42" />
            <Text style={styles.bindingText}>Manifest VC: {shl.manifestCredentialId}</Text>
          </View>
          <Text style={styles.bindingText}>Holder VP: {shl.presentationId}</Text>
        </View>
      ))}
      {!shlPackages.length && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ยังไม่มี SHL ใน scope นี้</Text>
          <Text style={styles.line}>ผู้ใช้นี้ยังไม่มี SHL package สำหรับแชร์ แต่ยังสามารถสแกน QR หรือสร้าง VP จากเอกสารได้</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 16 },
  title: { fontSize: 27, fontWeight: "700", color: "#111827", marginBottom: 8 },
  scanButton: { minHeight: 58, borderRadius: 8, backgroundColor: "#4f67f2", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  scanText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: { borderRadius: 8, backgroundColor: "#fff", padding: 18, gap: 8, borderWidth: 1, borderColor: "#d8dfe4" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  line: { color: "#374151", fontSize: 13.5 },
  bindings: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  bindingText: { color: "#62718a", fontSize: 13 }
});
