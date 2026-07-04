import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Activity, FilePlus2, QrCode, Send, Upload } from "lucide-react-native";
import { walletApi } from "@trustcare/api-client";
import {
  demoCardsByCategory,
  flattenCardsByCategory,
  readinessContextLabels,
  type CheckinQrResponse,
  type ReadinessContext,
  type ServicePacketResponse,
  type WalletImportJob
} from "@trustcare/wallet-core";
import { env } from "../env";

const apiOptions = { url: env.apiUrl, demoMode: env.demoMode, demoOrigin: "https://trustcare-wallet.local" };
const contexts = Object.keys(readinessContextLabels) as ReadinessContext[];

export function PrepareScreen() {
  const cards = useMemo(() => flattenCardsByCategory(demoCardsByCategory), []);
  const [context, setContext] = useState<ReadinessContext>("opd_visit");
  const [readiness, setReadiness] = useState<any>(null);
  const [servicePacket, setServicePacket] = useState<ServicePacketResponse | null>(null);
  const [checkinQr, setCheckinQr] = useState<CheckinQrResponse | null>(null);
  const [importJob, setImportJob] = useState<WalletImportJob | null>(null);

  useEffect(() => {
    void walletApi.readiness(apiOptions, { context }).then(setReadiness);
  }, [context]);

  const missing = readiness?.readiness?.missing ?? [];
  const ready = readiness?.readiness?.ready ?? [];
  const qrPayload = checkinQr?.qrPayload ?? servicePacket?.qrData;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>PREPARE FOR SERVICE</Text>
          <Text style={styles.title}>พร้อมก่อนรับบริการ</Text>
          <Text style={styles.subtitle}>{cards.length} credentials in wallet</Text>
        </View>
        <View style={styles.score}>
          <Text style={styles.scoreText}>{readiness?.readiness?.score ?? 0}%</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextRow}>
        {contexts.map(item => (
          <Pressable key={item} style={[styles.contextChip, context === item && styles.contextChipActive]} onPress={() => setContext(item)}>
            <Text style={[styles.contextText, context === item && styles.contextTextActive]}>{readinessContextLabels[item].th}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Activity color="#4f67f2" />
          <View>
            <Text style={styles.panelTitle}>{readinessContextLabels[context].en}</Text>
            <Text style={styles.panelSub}>{readinessContextLabels[context].purpose}</Text>
          </View>
        </View>
        <View style={styles.statGrid}>
          <MiniStat label="Required" value={`${readiness?.readiness?.requiredReady ?? 0}/${readiness?.readiness?.requiredTotal ?? 0}`} />
          <MiniStat label="Recommended" value={`${readiness?.readiness?.recommendedReady ?? 0}/${readiness?.readiness?.recommendedTotal ?? 0}`} />
        </View>
      </View>

      <View style={styles.grid}>
        <ChecklistCard title="Ready VC" tone="green" items={ready.map((item: any) => item.label)} empty="ยังไม่มี VC ที่ตรง contract" />
        <ChecklistCard title="Missing" tone="red" items={missing.map((item: any) => item.label)} empty="ครบถ้วน" />
      </View>

      <View style={styles.actionPanel}>
        <Pressable style={styles.primaryAction} onPress={() => void buildServicePacket(context, readiness).then(setServicePacket)}>
          <Send color="#fff" />
          <Text style={styles.primaryActionText}>สร้าง Service VP</Text>
        </Pressable>
        <View style={styles.actionRow}>
          <ActionButton icon={<QrCode color="#2f855a" />} label="Check-in SHL" onPress={() => void walletApi.generateCheckinQR(apiOptions, { context, consentAttested: true }).then(setCheckinQr)} />
          <ActionButton icon={<Upload color="#4f67f2" />} label="Import" onPress={() => void walletApi.importForService(apiOptions, { context, documentType: missing[0]?.key ?? "patient_summary" }).then(setImportJob)} />
          <ActionButton icon={<FilePlus2 color="#4f67f2" />} label="Request" onPress={() => undefined} />
        </View>
      </View>

      {qrPayload && (
        <View style={styles.qrPanel}>
          <QRCode value={qrPayload} size={180} />
          <Text style={styles.qrTitle}>{checkinQr ? "Check-in SHL QR" : "Service VP QR"}</Text>
          <Text style={styles.mono} numberOfLines={3}>{qrPayload}</Text>
        </View>
      )}

      {importJob && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Import job</Text>
          <Text style={styles.mono}>{importJob.importId} / {importJob.status}</Text>
        </View>
      )}
    </ScrollView>
  );
}

async function buildServicePacket(context: ReadinessContext, readiness: any) {
  return walletApi.buildServicePacket(apiOptions, {
    context,
    consentAttested: true,
    selectedCardIds: readiness?.readiness?.selectedCardIds,
    receiverName: "TrustCare compatible hospital"
  });
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ChecklistCard({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: "green" | "red" }) {
  return (
    <View style={styles.checkCard}>
      <Text style={styles.checkTitle}>{title}</Text>
      {(items.length ? items : [empty]).map(item => (
        <View key={item} style={styles.checkRow}>
          <View style={[styles.dot, tone === "green" ? styles.dotGreen : styles.dotRed]} />
          <Text style={styles.checkText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.actionButton} onPress={onPress}>
      {icon}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 22, paddingBottom: 120, gap: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 16, alignItems: "center", paddingTop: 24 },
  eyebrow: { color: "#4f67f2", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  title: { fontSize: 34, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#647084", fontSize: 16, marginTop: 4 },
  score: { width: 86, height: 86, borderRadius: 43, backgroundColor: "#eef3ff", alignItems: "center", justifyContent: "center" },
  scoreText: { color: "#4f67f2", fontSize: 24, fontWeight: "900" },
  contextRow: { gap: 10, paddingVertical: 2 },
  contextChip: { minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: "#d8dfe4", backgroundColor: "#fff", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  contextChipActive: { backgroundColor: "#4f67f2", borderColor: "#4f67f2" },
  contextText: { color: "#374151", fontWeight: "800" },
  contextTextActive: { color: "#fff" },
  panel: { borderRadius: 14, backgroundColor: "#fff", padding: 18, borderWidth: 1, borderColor: "#d8dfe4", gap: 14 },
  panelHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  panelTitle: { color: "#111827", fontSize: 18, fontWeight: "900" },
  panelSub: { color: "#647084", marginTop: 4 },
  statGrid: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, borderRadius: 10, backgroundColor: "#f4f6fa", padding: 12 },
  statValue: { color: "#111827", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#647084", marginTop: 2 },
  grid: { gap: 12 },
  checkCard: { borderRadius: 14, backgroundColor: "#fff", padding: 18, borderWidth: 1, borderColor: "#d8dfe4", gap: 10 },
  checkTitle: { fontSize: 18, color: "#111827", fontWeight: "900" },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: "#16a34a" },
  dotRed: { backgroundColor: "#dc2626" },
  checkText: { color: "#374151", flex: 1 },
  actionPanel: { borderRadius: 14, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#d8dfe4", gap: 12 },
  primaryAction: { minHeight: 58, borderRadius: 10, backgroundColor: "#4f67f2", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  primaryActionText: { color: "#fff", fontWeight: "900", fontSize: 17 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1, minHeight: 74, borderRadius: 10, backgroundColor: "#f4f6fa", alignItems: "center", justifyContent: "center", gap: 6 },
  actionText: { color: "#374151", fontWeight: "800", fontSize: 12 },
  qrPanel: { borderRadius: 14, backgroundColor: "#fff", padding: 20, borderWidth: 1, borderColor: "#d8dfe4", alignItems: "center", gap: 12 },
  qrTitle: { fontSize: 18, color: "#111827", fontWeight: "900" },
  mono: { fontFamily: "monospace", color: "#647084", textAlign: "center" }
});
