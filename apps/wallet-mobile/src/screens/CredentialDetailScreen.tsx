import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Download, Eye, QrCode, Shield, ArrowLeft } from "lucide-react-native";
import * as ScreenCapture from "expo-screen-capture";
import {
  canPresentCredential,
  credentialStatusLabel,
  extractSelectableFields,
  flattenCardsByCategory,
  getDemoCardsByCategory,
  getDemoHistory,
  presentationEnvelopeFromPresentation,
  presentationEnvelopeFromWalletCard,
  type WalletPresentationResponse,
} from "@trustcare/wallet-core";
import { CredentialDocumentNative } from "../components/CredentialDocumentNative";
import { useActiveWalletUser } from "../hooks/useActiveWalletUser";
import { useBiometricGate } from "../hooks/useBiometricGate";
import { useMobileSecuritySettings } from "../hooks/useMobileSecuritySettings";
import { publishMobileVpShare } from "../share/mobileSharePublisher";
import { cacheQr } from "../storage/offlineWallet";
import { env } from "../env";

type Tab = "details" | "trust" | "payload" | "history";

export function CredentialDetailScreen() {
  const { user } = useActiveWalletUser();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [presentation, setPresentation] =
    useState<WalletPresentationResponse | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [selectiveOpen, setSelectiveOpen] = useState(false);
  const [message, setMessage] = useState("");
  const security = useMobileSecuritySettings();
  const biometric = useBiometricGate();
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
  const card = useMemo(
    () =>
      flattenCardsByCategory(getDemoCardsByCategory(user.id)).find(
        (item) => String(item.id) === String(id),
      ),
    [id, user.id],
  );
  const history = useMemo(() => getDemoHistory(user.id), [user.id]);
  const selectableFields = useMemo(
    () => extractSelectableFields(card?.credentialData),
    [card?.credentialData],
  );
  const envelope = useMemo(() => {
    if (!card) return null;
    return presentation
      ? presentationEnvelopeFromPresentation(card, presentation)
      : presentationEnvelopeFromWalletCard(card);
  }, [card, presentation]);
  const presentable = card ? canPresentCredential(card) : false;

  useEffect(() => {
    if (
      !env.screenCaptureProtection ||
      !security.screenCaptureProtectionEnabled
    )
      return undefined;
    void ScreenCapture.preventScreenCaptureAsync();
    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, [security.screenCaptureProtectionEnabled]);

  if (!card) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundTitle}>ไม่พบเอกสารใน Wallet นี้</Text>
        <Text style={styles.muted}>
          เอกสารนี้ไม่ได้อยู่ใน scope ของ {user.nameTh}
        </Text>
      </View>
    );
  }

  const activeCard = card;

  async function generateQr() {
    setMessage("");
    if (!canPresentCredential(activeCard)) {
      setMessage(
        `เอกสารนี้ยังแชร์ไม่ได้: ${credentialStatusLabel(activeCard.credentialStatus)}`,
      );
      return;
    }
    if (!(await biometric.authenticate())) return;
    try {
      const result = await publishMobileVpShare({
        apiOptions,
        card: activeCard,
        userId: user.id,
        holderDid: user.holderDid,
        shareGatewayUrl: env.shareGatewayUrl,
        selectedFields: [],
        validMinutes: 10,
      });
      setPresentation(result.presentation);
      await cacheQr(
        activeCard.id,
        result.qrPayload,
        result.presentation.presentationId,
        result.presentation.expiresAt,
        user.id,
      );
      setSelectiveOpen(false);
      setMessage(
        result.warnings.length
          ? `สร้าง VP resolver QR สำเร็จ (${result.warnings.join(", ")})`
          : "สร้าง VP resolver QR สำเร็จ",
      );
      return;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้าง QR ไม่สำเร็จ");
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <ArrowLeft color="#4f67f2" />
        <Text style={styles.backText}>กลับ</Text>
      </Pressable>
      {envelope ? (
        <CredentialDocumentNative
          card={card}
          envelope={envelope}
          qrValue={presentation?.qrData}
        />
      ) : null}
      <View style={styles.actions}>
        <Pressable
          disabled={!presentable}
          style={[styles.actionPrimary, !presentable && styles.disabledAction]}
          onPress={() => void generateQr()}
        >
          <QrCode color="#fff" />
          <Text style={styles.actionPrimaryText}>QR Code</Text>
        </Pressable>
        <Pressable
          disabled={!presentable}
          style={[styles.actionPurple, !presentable && styles.disabledAction]}
          onPress={() => setSelectiveOpen((previous) => !previous)}
        >
          <Eye color="#7c3aed" />
          <Text style={styles.actionPurpleText}>ตรวจข้อมูลก่อนแชร์</Text>
        </Pressable>
        <Pressable
          style={styles.actionGreen}
          onPress={() =>
            setMessage(
              "การพิมพ์ตามขนาดจริง / บันทึก PDF ใช้งานผ่าน Wallet Web; Mobile ใช้ Shared Renderer เดียวกันแต่ยังไม่เปิด native print adapter",
            )
          }
        >
          <Download color="#167347" />
          <Text style={styles.actionGreenText}>PDF (Web)</Text>
        </Pressable>
      </View>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {selectiveOpen && (
        <View style={styles.selectorPanel}>
          <Text style={styles.selectorTitle}>ตรวจข้อมูลก่อนแชร์</Text>
          <Text style={styles.muted}>
            ผู้ออกเอกสารยังไม่ได้ให้ credential ที่เลือกเปิดเผยบางส่วนได้
            ระบบจึงส่งเอกสารนี้ทั้งฉบับโดยไม่ตัดข้อมูลหรือสร้าง proof แทน
          </Text>
          {selectableFields.map((field) => (
            <View key={field.path} style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {field.valuePreview || "-"}
                </Text>
              </View>
            </View>
          ))}
          {!selectableFields.length && (
            <Text style={styles.muted}>
              ไม่พบรายการข้อมูลสำหรับแสดงตัวอย่าง
            </Text>
          )}
          <Pressable
            style={styles.shareSelected}
            onPress={() => void generateQr()}
          >
            <Text style={styles.shareSelectedText}>
              สร้าง QR เอกสารทั้งฉบับ
            </Text>
          </Pressable>
        </View>
      )}
      {presentation && (
        <View style={styles.presentation}>
          <QrCode color="#4f67f2" />
          <View style={{ flex: 1 }}>
            <Text style={styles.presentationTitle}>
              Verifiable Presentation
            </Text>
            <Text style={styles.mono}>{presentation.presentationId}</Text>
            <Text style={styles.muted}>
              หมดอายุ {new Date(presentation.expiresAt).toLocaleString("th-TH")}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.tabs}>
        {(["details", "trust", "payload", "history"] as Tab[]).map((item) => (
          <Pressable
            key={item}
            style={[styles.tab, tab === item && styles.activeTab]}
            onPress={() => setTab(item)}
          >
            <Text
              style={[styles.tabText, tab === item && styles.activeTabText]}
            >
              {item === "details"
                ? "รายละเอียด"
                : item === "trust"
                  ? "Trust"
                  : item === "history"
                    ? "ประวัติ"
                    : "Payload"}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.detailBox}>
        {tab === "details" && (
          <>
            <Row
              label="ประเภท"
              value={envelope?.display.title ?? card.displayName}
            />
            <Row label="Credential ID" value={String(card.credentialId)} mono />
            <Row
              label="Issuer DID"
              value={envelope?.issuer?.did ?? card.issuerDid ?? "-"}
              mono
            />
            <Row
              label="Trust"
              value={envelope?.trust.status ?? "proof_missing"}
            />
            <Row
              label="วันที่ออก"
              value={
                card.issuedAt
                  ? new Date(card.issuedAt).toLocaleDateString("th-TH")
                  : "-"
              }
            />
            <Row
              label="วันหมดอายุ"
              value={
                envelope?.policy.expiresAt
                  ? new Date(envelope.policy.expiresAt).toLocaleDateString(
                      "th-TH",
                    )
                  : "-"
              }
            />
          </>
        )}
        {tab === "trust" && (
          <View style={styles.trustList}>
            {envelope?.trust.checklist.map((item) => (
              <View key={item.key} style={styles.trustRow}>
                <Shield color={item.ok ? "#0b6b42" : "#b45309"} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>{item.label}</Text>
                  <Text style={styles.muted}>
                    {item.detail ?? item.status ?? "-"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        {tab === "payload" && (
          <Text style={styles.mono}>
            {JSON.stringify(card.credentialData, null, 2)}
          </Text>
        )}
        {tab === "history" && (
          <View style={styles.trustList}>
            {history.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>
                    {item.verifierName ?? item.purpose ?? "Verifier"}
                  </Text>
                  <Text style={styles.muted}>
                    {item.presentedAt
                      ? new Date(item.presentedAt).toLocaleString("th-TH")
                      : (item.presentationId ?? "-")}
                  </Text>
                </View>
                <Text style={styles.historyBadge}>
                  {item.verificationResult ?? "recorded"}
                </Text>
              </View>
            ))}
            {presentation && (
              <View style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>QR ล่าสุดในเครื่อง</Text>
                  <Text style={styles.muted}>
                    {presentation.presentationId}
                  </Text>
                </View>
                <Text style={styles.historyBadge}>{presentation.mode}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f6fa" },
  content: { padding: 20, paddingBottom: 120 },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  backText: { color: "#4f67f2", fontSize: 16, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 12, marginBottom: 18 },
  actionPrimary: {
    flex: 1,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: "#4f67f2",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionPrimaryText: { color: "#fff", fontWeight: "700" },
  actionPurple: {
    flex: 1,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: "#eee5ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionPurpleText: { color: "#7c3aed", fontWeight: "700" },
  actionGreen: {
    flex: 1,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: "#dcf8e8",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionGreenText: { color: "#167347", fontWeight: "700" },
  disabledAction: { opacity: 0.46 },
  message: { color: "#b45309", fontWeight: "700", marginBottom: 12 },
  selectorPanel: {
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  selectorTitle: { color: "#111827", fontSize: 16, fontWeight: "700" },
  fieldRow: {
    minHeight: 58,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#9ca3af",
  },
  checkboxChecked: { backgroundColor: "#4f67f2", borderColor: "#4f67f2" },
  fieldLabel: { color: "#111827", fontWeight: "700" },
  shareSelected: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#4f67f2",
    alignItems: "center",
    justifyContent: "center",
  },
  shareSelectedText: { color: "#fff", fontWeight: "700" },
  presentation: {
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  presentationTitle: { fontSize: 16, fontWeight: "700" },
  muted: { color: "#62718a" },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  activeTab: { backgroundColor: "#e8eefc" },
  tabText: { color: "#62718a", fontWeight: "700" },
  activeTabText: { color: "#4f67f2" },
  detailBox: { borderRadius: 8, backgroundColor: "#fff", padding: 18, gap: 14 },
  trustList: { gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  label: { color: "#62718a", fontSize: 13.5 },
  value: {
    flex: 1,
    textAlign: "right",
    color: "#111827",
    fontSize: 13.5,
    fontWeight: "700",
  },
  mono: { fontFamily: "Courier", fontSize: 13 },
  trustRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  historyRow: {
    minHeight: 58,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyBadge: {
    color: "#0b6b42",
    backgroundColor: "#dcfce7",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "700",
    fontSize: 12,
  },
  notFound: {
    flex: 1,
    backgroundColor: "#f4f6fa",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  notFoundTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
