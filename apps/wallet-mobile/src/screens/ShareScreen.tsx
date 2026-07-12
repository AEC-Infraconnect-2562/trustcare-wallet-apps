import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Camera, CheckCircle2, QrCode, Send } from "lucide-react-native";
import { router } from "expo-router";
import {
  canPresentCredential,
  credentialStatusLabel,
  flattenCardsByCategory,
  getDemoCardsByCategory,
  readinessContextLabels,
  type ReadinessContext,
  type SharePackageMode,
  type WalletCard,
} from "@trustcare/wallet-core";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { useBiometricGate } from "../hooks/useBiometricGate";
import {
  publishMobileSharePackage,
  type MobileSharePackagePublication,
} from "../share/mobileSharePublisher";
import { env } from "../env";

const contextOptions: ReadinessContext[] = [
  "opd_visit",
  "emergency",
  "referral",
  "cross_border",
  "medical_tourist",
  "insurance_claim",
  "pharmacy_dispense",
];

const packageOptions: Array<{ mode: SharePackageMode; label: string }> = [
  { mode: "PurposeVP", label: "แชร์เอกสารที่เลือก" },
];

export function ShareScreen() {
  const { user } = useActiveWalletUser();
  const biometric = useBiometricGate();
  const [context, setContext] = useState<ReadinessContext>("opd_visit");
  const [mode, setMode] = useState<SharePackageMode>("PurposeVP");
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);
  const [publication, setPublication] =
    useState<MobileSharePackagePublication | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const cards = useMemo(
    () => flattenCardsByCategory(getDemoCardsByCategory(user.id)),
    [user.id],
  );
  const activeCards = useMemo(
    () => cards.filter((card) => canPresentCredential(card)),
    [cards],
  );
  const apiOptions = useMemo(
    () => ({
      url: env.apiUrl,
      demoMode: env.demoMode,
      demoOrigin: "https://trustcare.example.com",
      shareGatewayUrl: env.shareGatewayUrl,
      userId: user.id,
    }),
    [user.id],
  );

  useEffect(() => {
    setSelectedIds(activeCards.slice(0, 2).map((card) => card.id));
    setPublication(null);
  }, [activeCards, user.id]);

  function toggleCard(card: WalletCard) {
    setPublication(null);
    setSelectedIds((previous) => {
      const key = String(card.id);
      if (previous.map(String).includes(key)) {
        return previous.filter((id) => String(id) !== key);
      }
      return [...previous, card.id];
    });
  }

  async function publishPackage() {
    setMessage("");
    setPublication(null);
    if (!(await biometric.authenticate())) return;
    setBusy(true);
    try {
      const result = await publishMobileSharePackage({
        apiOptions,
        cards,
        selectedCardIds: selectedIds,
        userId: user.id,
        holderDid: user.holderDid,
        shareGatewayUrl: env.shareGatewayUrl,
        mode,
        context,
        validMinutes: mode === "PurposeVP" ? 10 : 24 * 60,
      });
      setPublication(result);
      setMessage("สร้าง QR สำหรับสแกนข้ามเครื่องสำเร็จ");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "สร้าง share package ไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>แชร์และตรวจสอบ</Text>
      <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
        <Camera color="#fff" />
        <Text style={styles.scanText}>สแกน QR Code</Text>
      </Pressable>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>บริบทการใช้งาน</Text>
        <View style={styles.optionGrid}>
          {contextOptions.map((item) => (
            <Pressable
              key={item}
              style={[
                styles.option,
                context === item && styles.optionSelected,
              ]}
              onPress={() => {
                setContext(item);
                setPublication(null);
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  context === item && styles.optionTextSelected,
                ]}
              >
                {readinessContextLabels[item]?.th ?? item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>รูปแบบแพ็กเกจ</Text>
        <View style={styles.packageRow}>
          {packageOptions.map((item) => (
            <Pressable
              key={item.mode}
              style={[
                styles.packageButton,
                mode === item.mode && styles.packageButtonSelected,
              ]}
              onPress={() => {
                setMode(item.mode);
                setPublication(null);
              }}
            >
              <Text
                style={[
                  styles.packageText,
                  mode === item.mode && styles.packageTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>เลือกเอกสาร</Text>
          <Text style={styles.count}>{selectedIds.length} รายการ</Text>
        </View>
        {cards.map((card) => {
          const selected = selectedIds.map(String).includes(String(card.id));
          const presentable = canPresentCredential(card);
          return (
            <Pressable
              key={card.id}
              disabled={!presentable}
              style={[
                styles.card,
                selected && styles.cardSelected,
                !presentable && styles.cardDisabled,
              ]}
              onPress={() => toggleCard(card)}
            >
              <View style={styles.checkSlot}>
                {selected ? (
                  <CheckCircle2 color="#0f7c55" size={22} />
                ) : (
                  <View style={styles.emptyCheck} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{card.displayName}</Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {card.issuerHospitalName ?? card.issuerDid ?? "-"}
                </Text>
              </View>
              <Text style={styles.status}>
                {credentialStatusLabel(card.credentialStatus)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        disabled={busy || !selectedIds.length}
        style={[
          styles.publishButton,
          (busy || !selectedIds.length) && styles.disabledButton,
        ]}
        onPress={() => void publishPackage()}
      >
        <Send color="#fff" />
        <Text style={styles.publishText}>
          {busy ? "กำลังสร้าง..." : "สร้าง QR สำหรับแชร์"}
        </Text>
      </Pressable>

      {!!message && <Text style={styles.message}>{message}</Text>}

      {publication && (
        <View style={styles.qrPanel}>
          <View style={styles.qrBox}>
            <QRCode value={publication.qrPayload} size={220} />
          </View>
          <View style={styles.qrHeader}>
            <QrCode color="#4f67f2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.qrTitle}>{publication.packageId}</Text>
              <Text style={styles.cardMeta}>
                หมดอายุ{" "}
                {new Date(publication.expiresAt).toLocaleString("th-TH")}
              </Text>
            </View>
          </View>
          <Text style={styles.payloadText} numberOfLines={3}>
            {publication.qrPayload}
          </Text>
          {publication.artifactUrl ? (
            <Text style={styles.cardMeta} numberOfLines={2}>
              Artifact: {publication.artifactUrl}
            </Text>
          ) : null}
          {publication.warnings.map((warning) => (
            <Text key={warning} style={styles.warning}>
              {warning}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 16 },
  title: { fontSize: 27, fontWeight: "700", color: "#111827", marginBottom: 8 },
  scanButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: "#4f67f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  scanText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  section: {
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#d8dfe4",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  count: { color: "#4f67f2", fontWeight: "800", fontSize: 13 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    justifyContent: "center",
    maxWidth: "100%",
  },
  optionSelected: { backgroundColor: "#e8eefc", borderColor: "#4f67f2" },
  optionText: { color: "#4b5563", fontWeight: "700", fontSize: 12.5 },
  optionTextSelected: { color: "#4f67f2" },
  packageRow: { flexDirection: "row", gap: 8 },
  packageButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    backgroundColor: "#f8fafc",
  },
  packageButtonSelected: {
    backgroundColor: "#e8eefc",
    borderColor: "#4f67f2",
  },
  packageText: { color: "#4b5563", fontWeight: "800", fontSize: 12 },
  packageTextSelected: { color: "#4f67f2" },
  card: {
    minHeight: 70,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardSelected: { borderColor: "#0f7c55", backgroundColor: "#ecfdf3" },
  cardDisabled: { opacity: 0.45 },
  checkSlot: { width: 28, alignItems: "center" },
  emptyCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#cbd5e1",
  },
  cardTitle: { color: "#111827", fontSize: 14, fontWeight: "800" },
  cardMeta: { color: "#647084", fontSize: 12, marginTop: 2 },
  status: { color: "#0f7c55", fontSize: 11.5, fontWeight: "800" },
  publishButton: {
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: "#4f67f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  disabledButton: { opacity: 0.48 },
  publishText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  message: { color: "#b45309", fontWeight: "800" },
  qrPanel: {
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    padding: 16,
    gap: 12,
  },
  qrBox: {
    minHeight: 252,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#edf2f7",
  },
  qrHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  qrTitle: { color: "#111827", fontWeight: "800", fontSize: 15 },
  payloadText: {
    color: "#111827",
    fontSize: 12,
    fontFamily: "Courier",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
  },
  warning: { color: "#b45309", fontWeight: "700", fontSize: 12 },
});
