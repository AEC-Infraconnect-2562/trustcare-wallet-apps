import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Download, Eye, QrCode, Shield, ArrowLeft } from "lucide-react-native";
import * as ScreenCapture from "expo-screen-capture";
import { walletApi } from "@trustcare/api-client";
import { flattenCardsByCategory, getDemoCardsByCategory, type WalletPresentationResponse } from "@trustcare/wallet-core";
import { CredentialDocumentNative } from "../components/CredentialDocumentNative";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { useBiometricGate } from "../hooks/useBiometricGate";
import { cacheQr } from "../storage/offlineWallet";
import { env } from "../env";

type Tab = "details" | "trust" | "payload";

export function CredentialDetailScreen() {
  const { user } = useActiveWalletUser();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [presentation, setPresentation] = useState<WalletPresentationResponse | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const biometric = useBiometricGate();
  const apiOptions = useMemo(() => ({ url: env.apiUrl, demoMode: env.demoMode, demoOrigin: "https://trustcare.example.com", userId: user.id }), [user.id]);
  const card = useMemo(() => flattenCardsByCategory(getDemoCardsByCategory(user.id)).find(item => String(item.id) === String(id)), [id, user.id]);

  useEffect(() => {
    if (!env.screenCaptureProtection) return undefined;
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  if (!card) {
    return <View style={styles.notFound}><Text style={styles.notFoundTitle}>ไม่พบเอกสารใน Wallet นี้</Text><Text style={styles.muted}>เอกสารนี้ไม่ได้อยู่ใน scope ของ {user.nameTh}</Text></View>;
  }

  const activeCard = card;

  async function generateQr(selectedFields: string[] = []) {
    if (!(await biometric.authenticate())) return;
    const result = await walletApi.present(apiOptions, { cardId: activeCard.id, selectedFields, validMinutes: 10 });
    setPresentation(result);
    await cacheQr(activeCard.id, result.qrData, result.presentationId, result.expiresAt, user.id);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft color="#4f67f2" /><Text style={styles.backText}>กลับ</Text></Pressable>
      <CredentialDocumentNative card={card} qrValue={presentation?.qrData} />
      <View style={styles.actions}>
        <Pressable style={styles.actionPrimary} onPress={() => void generateQr()}><QrCode color="#fff" /><Text style={styles.actionPrimaryText}>QR Code</Text></Pressable>
        <Pressable style={styles.actionPurple} onPress={() => void generateQr(["credentialSubject.patient.fullNameTh"])}><Eye color="#7c3aed" /><Text style={styles.actionPurpleText}>SD (ZKP)</Text></Pressable>
        <Pressable style={styles.actionGreen}><Download color="#167347" /><Text style={styles.actionGreenText}>PDF</Text></Pressable>
      </View>
      {presentation && (
        <View style={styles.presentation}>
          <QrCode color="#4f67f2" />
          <View style={{ flex: 1 }}>
            <Text style={styles.presentationTitle}>Verifiable Presentation</Text>
            <Text style={styles.mono}>{presentation.presentationId}</Text>
            <Text style={styles.muted}>หมดอายุ {new Date(presentation.expiresAt).toLocaleString("th-TH")}</Text>
          </View>
        </View>
      )}
      <View style={styles.tabs}>
        {(["details", "trust", "payload"] as Tab[]).map(item => (
          <Pressable key={item} style={[styles.tab, tab === item && styles.activeTab]} onPress={() => setTab(item)}>
            <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item === "details" ? "รายละเอียด" : item === "trust" ? "Trust" : "Payload"}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.detailBox}>
        {tab === "details" && (
          <>
            <Row label="ประเภท" value={card.displayName} />
            <Row label="Credential ID" value={String(card.credentialId)} mono />
            <Row label="Issuer DID" value={card.issuerDid ?? "-"} mono />
            <Row label="สถานะ" value="ใช้งานได้" />
            <Row label="วันที่ออก" value={card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("th-TH") : "-"} />
            <Row label="วันหมดอายุ" value={card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("th-TH") : "-"} />
          </>
        )}
        {tab === "trust" && (
          <View style={styles.trustRow}><Shield color="#0b6b42" /><Text style={styles.value}>Issuer, holder, status, consent, and expiry checklist are bound to the backend VP record.</Text></View>
        )}
        {tab === "payload" && <Text style={styles.mono}>{JSON.stringify(card.credentialData, null, 2)}</Text>}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 20, paddingBottom: 120 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  backText: { color: "#4f67f2", fontSize: 16, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginBottom: 18 },
  actionPrimary: { flex: 1, minHeight: 66, borderRadius: 8, backgroundColor: "#4f67f2", alignItems: "center", justifyContent: "center", gap: 6 },
  actionPrimaryText: { color: "#fff", fontWeight: "700" },
  actionPurple: { flex: 1, minHeight: 66, borderRadius: 8, backgroundColor: "#eee5ff", alignItems: "center", justifyContent: "center", gap: 6 },
  actionPurpleText: { color: "#7c3aed", fontWeight: "700" },
  actionGreen: { flex: 1, minHeight: 66, borderRadius: 8, backgroundColor: "#dcf8e8", alignItems: "center", justifyContent: "center", gap: 6 },
  actionGreenText: { color: "#167347", fontWeight: "700" },
  presentation: { borderRadius: 8, backgroundColor: "#fff", padding: 16, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 16 },
  presentationTitle: { fontSize: 16, fontWeight: "700" },
  muted: { color: "#62718a" },
  tabs: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", marginBottom: 12 },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  activeTab: { backgroundColor: "#e8eefc" },
  tabText: { color: "#62718a", fontWeight: "700" },
  activeTabText: { color: "#4f67f2" },
  detailBox: { borderRadius: 8, backgroundColor: "#fff", padding: 18, gap: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  label: { color: "#62718a", fontSize: 13.5 },
  value: { flex: 1, textAlign: "right", color: "#111827", fontSize: 13.5, fontWeight: "700" },
  mono: { fontFamily: "Courier", fontSize: 13 },
  trustRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  notFound: { flex: 1, backgroundColor: "#f4f6fa", alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  notFoundTitle: { color: "#111827", fontSize: 18, fontWeight: "700", textAlign: "center" }
});
