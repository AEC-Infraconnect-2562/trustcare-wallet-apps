import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Bell,
  Archive,
  Fingerprint,
  ShieldCheck,
  Wifi,
  WifiOff,
  Wallet,
} from "lucide-react-native";
import { router } from "expo-router";
import {
  isWalletDocumentTrustVerified,
  type WalletDocumentRecordV2,
} from "@trustcare/wallet-core";
import { WalletDocumentListItem } from "../components/WalletDocumentListItem";
import { RuntimeEnvironmentBanner } from "../components/RuntimeEnvironmentBanner";
import { isCurrentPatientDocument } from "../documents/patientDocumentPresentation";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { useMobileWalletDocuments } from "../hooks/useMobileWalletDocuments";
import { useMobileSecuritySettings } from "../hooks/useMobileSecuritySettings";

export function WalletScreen() {
  const { user } = useActiveWalletUser();
  const security = useMobileSecuritySettings();
  const { documents, isLoading, error, refresh } = useMobileWalletDocuments();
  const online = useNetworkState();
  const currentDocuments = documents.filter(isCurrentPatientDocument);
  const verifiedDocuments = documents.filter((document) =>
    isWalletDocumentTrustVerified(document),
  );
  const latestReceivedAt = latestDocumentTimestamp(documents);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <RuntimeEnvironmentBanner />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>TrustCare Wallet</Text>
          <Text style={styles.title}>เอกสารสุขภาพ</Text>
          <Text style={styles.name}>{user.nameTh}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.circle}>
            <Bell color="#4b5563" size={21} />
          </Pressable>
          <Pressable style={[styles.circle, styles.avatar]}>
            {user.avatarUrl ? (
              <Image
                source={{ uri: user.avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>{user.initials}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statLeft}>
          <Wallet color="#4f67f2" size={22} />
          <View>
            <Text style={styles.statText}>{documents.length} เอกสาร</Text>
            <Text style={styles.statSub}>
              {currentDocuments.length} รายการเป็นฉบับปัจจุบัน
            </Text>
          </View>
        </View>
        <Text style={styles.archive}>
          <Archive size={16} color="#4f67f2" /> อยู่ในคลังบนอุปกรณ์{" "}
          {documents.length} รายการ
        </Text>
      </View>

      <View style={styles.trustRow}>
        <View style={styles.trustChip}>
          <ShieldCheck color="#365f91" size={16} />
          <Text style={styles.trustText}>
            ตรวจสอบครบแล้ว {verifiedDocuments.length} รายการ
          </Text>
        </View>
        <Text style={styles.scopeText}>
          อ้างอิงจากผลตรวจล่าสุดของแต่ละเอกสาร
        </Text>
      </View>
      <View style={styles.stateGrid}>
        <StateChip
          icon={
            online ? (
              <Wifi color="#0f7c55" size={16} />
            ) : (
              <WifiOff color="#b45309" size={16} />
            )
          }
          label={online ? "ออนไลน์" : "ออฟไลน์"}
          value={online ? "พร้อมรับข้อมูลใหม่" : "ใช้เอกสารที่เก็บไว้ในเครื่อง"}
        />
        <StateChip
          icon={
            <Fingerprint
              color={security.biometricEnabled ? "#0f7c55" : "#647084"}
              size={16}
            />
          }
          label="การล็อกด้วยลายนิ้วมือหรือใบหน้า"
          value={security.biometricEnabled ? "เปิดใช้งาน" : "ยังไม่ได้เปิด"}
        />
        <StateChip
          icon={<Archive color="#4f67f2" size={16} />}
          label="รับเอกสารล่าสุด"
          value={
            latestReceivedAt
              ? new Date(latestReceivedAt).toLocaleString("th-TH")
              : "ยังไม่มีเอกสาร"
          }
        />
      </View>

      {error ? (
        <Pressable style={styles.loadError} onPress={refresh}>
          <Text style={styles.loadErrorTitle}>เปิดคลังเอกสารไม่สำเร็จ</Text>
          <Text style={styles.loadErrorBody}>
            {error} · แตะเพื่อลองอีกครั้ง
          </Text>
        </Pressable>
      ) : null}
      {isLoading ? (
        <Text style={styles.loadingText}>กำลังเปิดเอกสารของคุณ…</Text>
      ) : null}
      <View style={styles.stack}>
        {documents.slice(0, 5).map((document) => (
          <WalletDocumentListItem
            key={document.id}
            document={document}
            onPress={() =>
              router.push({
                pathname: "/document/[id]",
                params: { id: document.id },
              })
            }
          />
        ))}
      </View>
    </ScrollView>
  );
}

function latestDocumentTimestamp(
  documents: readonly WalletDocumentRecordV2[],
): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const document of documents) {
    const value = document.provenance.receivedAt;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function StateChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.stateChip}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={styles.stateLabel}>{label}</Text>
        <Text style={styles.stateValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function useNetworkState() {
  const [online, setOnline] = useState(() => {
    const candidate = globalThis.navigator as { onLine?: boolean } | undefined;
    return candidate?.onLine ?? true;
  });

  useEffect(() => {
    const windowLike = globalThis as unknown as {
      addEventListener?: (event: string, listener: () => void) => void;
      removeEventListener?: (event: string, listener: () => void) => void;
      navigator?: { onLine?: boolean };
    };
    if (!windowLike.addEventListener || !windowLike.removeEventListener)
      return undefined;
    const syncOnline = () => setOnline(windowLike.navigator?.onLine ?? true);
    windowLike.addEventListener("online", syncOnline);
    windowLike.addEventListener("offline", syncOnline);
    return () => {
      windowLike.removeEventListener?.("online", syncOnline);
      windowLike.removeEventListener?.("offline", syncOnline);
    };
  }, []);

  return online;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 20, paddingBottom: 120 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    paddingTop: 20,
    paddingBottom: 18,
  },
  kicker: {
    color: "#5b6475",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 3,
  },
  title: { fontSize: 26, fontWeight: "700", color: "#111827", lineHeight: 32 },
  name: { fontSize: 14, color: "#5b646f", marginTop: 2 },
  headerActions: { flexDirection: "row", gap: 10 },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef0f4",
  },
  avatar: { backgroundColor: "#4f67f2", overflow: "hidden" },
  avatarImage: { width: 48, height: 48 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  statusCard: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#dce3ee",
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  statLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  statText: { fontSize: 16, color: "#1f2937", fontWeight: "700" },
  statSub: { fontSize: 12, color: "#667085", marginTop: 2 },
  archive: { color: "#4f67f2", fontSize: 12, fontWeight: "700" },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    gap: 10,
  },
  trustChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#eaf2fb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  trustText: { color: "#365f91", fontSize: 12, fontWeight: "700" },
  scopeText: { color: "#667085", fontSize: 11 },
  stateGrid: { gap: 8, marginTop: 14 },
  stateChip: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stateLabel: { color: "#111827", fontSize: 12, fontWeight: "800" },
  stateValue: { color: "#647084", fontSize: 11.5, marginTop: 2 },
  loadError: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f4c7c3",
    backgroundColor: "#fff5f4",
    padding: 14,
    gap: 4,
  },
  loadErrorTitle: { color: "#b42318", fontSize: 14, fontWeight: "800" },
  loadErrorBody: { color: "#7a271a", fontSize: 12, lineHeight: 18 },
  loadingText: { color: "#667085", fontSize: 13, marginTop: 18 },
  stack: { paddingTop: 22, gap: 10 },
});
