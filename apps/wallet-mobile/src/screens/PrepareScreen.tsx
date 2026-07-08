import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Activity, FilePlus2, Send, Upload } from "lucide-react-native";
import { walletApi } from "@trustcare/api-client";
import {
  flattenCardsByCategory,
  getDemoCardsByCategory,
  readinessContextLabels,
  type ReadinessContext,
  type WalletImportJob,
} from "@trustcare/wallet-core";
import { env } from "../env";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";

const contexts = Object.keys(readinessContextLabels) as ReadinessContext[];

export function PrepareScreen() {
  const { user } = useActiveWalletUser();
  const apiOptions = useMemo(
    () => ({
      url: env.apiUrl,
      demoMode: env.demoMode,
      demoOrigin: "https://trustcare-wallet.local",
      userId: user.id,
    }),
    [user.id],
  );
  const cards = useMemo(
    () => flattenCardsByCategory(getDemoCardsByCategory(user.id)),
    [user.id],
  );
  const [context, setContext] = useState<ReadinessContext>("opd_visit");
  const [readiness, setReadiness] = useState<any>(null);
  const [importJob, setImportJob] = useState<WalletImportJob | null>(null);

  useEffect(() => {
    void walletApi
      .readiness(apiOptions, { context, patientId: user.patientId })
      .then(setReadiness);
  }, [apiOptions, context, user.patientId]);

  const missing = readiness?.readiness?.missing ?? [];
  const ready = readiness?.readiness?.ready ?? [];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>เตรียมเข้ารับบริการ</Text>
          <Text style={styles.title}>พร้อมก่อนรับบริการ</Text>
          <Text style={styles.subtitle}>{cards.length} เอกสารใน Wallet</Text>
        </View>
        <View style={styles.score}>
          <Text style={styles.scoreText}>
            {readiness?.readiness?.score ?? 0}%
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.contextRow}
      >
        {contexts.map((item) => (
          <Pressable
            key={item}
            style={[
              styles.contextChip,
              context === item && styles.contextChipActive,
            ]}
            onPress={() => setContext(item)}
          >
            <Text
              style={[
                styles.contextText,
                context === item && styles.contextTextActive,
              ]}
            >
              {readinessContextLabels[item].th}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Activity color="#4f67f2" />
          <View>
            <Text style={styles.panelTitle}>
              {readinessContextLabels[context].th}
            </Text>
            <Text style={styles.panelSub}>
              {readinessContextLabels[context].purpose}
            </Text>
          </View>
        </View>
        <View style={styles.statGrid}>
          <MiniStat
            label="จำเป็น"
            value={`${readiness?.readiness?.requiredReady ?? 0}/${readiness?.readiness?.requiredTotal ?? 0}`}
          />
          <MiniStat
            label="แนะนำ"
            value={`${readiness?.readiness?.recommendedReady ?? 0}/${readiness?.readiness?.recommendedTotal ?? 0}`}
          />
        </View>
      </View>

      <View style={styles.grid}>
        <ChecklistCard
          title="VC ที่พร้อมใช้"
          tone="green"
          items={ready.map((item: any) => item.label)}
          empty="ยังไม่มี VC ที่ตรง contract"
        />
        <ChecklistCard
          title="เอกสารที่ขาด"
          tone="red"
          items={missing.map((item: any) => item.label)}
          empty="ครบถ้วน"
        />
      </View>

      <View style={styles.actionPanel}>
        <Pressable
          style={styles.primaryAction}
          onPress={() =>
            router.push({ pathname: "/share", params: { context } })
          }
        >
          <Send color="#fff" />
          <Text style={styles.primaryActionText}>
            ไปหน้าแชร์เพื่อสร้าง VP / SHL
          </Text>
        </Pressable>
        <View style={styles.actionRow}>
          <ActionButton
            icon={<Upload color="#4f67f2" />}
            label="นำเข้า"
            onPress={() =>
              void walletApi
                .importForService(apiOptions, {
                  context,
                  patientId: user.patientId,
                  documentType: missing[0]?.key ?? "patient_summary",
                })
                .then(setImportJob)
            }
          />
          <ActionButton
            icon={<FilePlus2 color="#4f67f2" />}
            label="ขอเอกสาร"
            onPress={() => undefined}
          />
        </View>
      </View>

      {importJob && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>งานนำเข้า</Text>
          <Text style={styles.mono}>
            {importJob.importId} / {importJob.status}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ChecklistCard({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: "green" | "red";
}) {
  return (
    <View style={styles.checkCard}>
      <Text style={styles.checkTitle}>{title}</Text>
      {(items.length ? items : [empty]).map((item) => (
        <View key={item} style={styles.checkRow}>
          <View
            style={[
              styles.dot,
              tone === "green" ? styles.dotGreen : styles.dotRed,
            ]}
          />
          <Text style={styles.checkText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    paddingTop: 24,
  },
  eyebrow: {
    color: "#4f67f2",
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: { fontSize: 27, fontWeight: "700", color: "#111827" },
  subtitle: { color: "#647084", fontSize: 13.5, marginTop: 4 },
  score: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#eef3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: { color: "#4f67f2", fontSize: 22, fontWeight: "700" },
  contextRow: { gap: 10, paddingVertical: 2 },
  contextChip: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  contextChipActive: { backgroundColor: "#4f67f2", borderColor: "#4f67f2" },
  contextText: { color: "#374151", fontWeight: "700" },
  contextTextActive: { color: "#fff" },
  panel: {
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 18,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    gap: 14,
  },
  panelHeader: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  panelTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  panelSub: { color: "#647084", marginTop: 4 },
  statGrid: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, borderRadius: 10, backgroundColor: "#f4f6fa", padding: 12 },
  statValue: { color: "#111827", fontSize: 20, fontWeight: "700" },
  statLabel: { color: "#647084", marginTop: 2 },
  grid: { gap: 12 },
  checkCard: {
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 18,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    gap: 10,
  },
  checkTitle: { fontSize: 16, color: "#111827", fontWeight: "700" },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: "#16a34a" },
  dotRed: { backgroundColor: "#dc2626" },
  checkText: { color: "#374151", flex: 1 },
  actionPanel: {
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 14,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    gap: 12,
  },
  primaryAction: {
    minHeight: 58,
    borderRadius: 10,
    backgroundColor: "#4f67f2",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryActionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionButton: {
    flex: 1,
    minHeight: 74,
    borderRadius: 10,
    backgroundColor: "#f4f6fa",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { color: "#374151", fontWeight: "700", fontSize: 12 },
  qrPanel: {
    borderRadius: 14,
    backgroundColor: "#fff",
    padding: 20,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    alignItems: "center",
    gap: 12,
  },
  qrTitle: { fontSize: 16, color: "#111827", fontWeight: "700" },
  mono: { fontFamily: "monospace", color: "#647084", textAlign: "center" },
});
