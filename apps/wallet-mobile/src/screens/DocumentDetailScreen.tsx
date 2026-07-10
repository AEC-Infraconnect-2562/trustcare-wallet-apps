import { useEffect, useMemo } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ScreenCapture from "expo-screen-capture";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  ShieldAlert,
} from "lucide-react-native";
import type { TrustCheck } from "@trustcare/wallet-core";
import {
  documentDisplayDate,
  lifecyclePresentation,
  toneBackground,
  toneColor,
  patientTrustPresentation,
} from "../documents/patientDocumentPresentation";
import { RuntimeEnvironmentBanner } from "../components/RuntimeEnvironmentBanner";
import { env } from "../env";
import { useMobileWalletDocuments } from "../hooks/useMobileWalletDocuments";
import { useMobileSecuritySettings } from "../hooks/useMobileSecuritySettings";

export function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, isLoading, error } = useMobileWalletDocuments();
  const security = useMobileSecuritySettings();
  const document = useMemo(
    () => documents.find((record) => record.id === id),
    [documents, id],
  );

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

  if (isLoading) {
    return <CenteredState title="กำลังเปิดเอกสาร…" />;
  }
  if (error || !document) {
    return (
      <CenteredState
        title="ไม่พบเอกสารใน Wallet นี้"
        body={error ?? "เอกสารอาจถูกย้าย แทนที่ หรืออยู่ใน Wallet ของบุคคลอื่น"}
      />
    );
  }

  const trust = patientTrustPresentation(document);
  const source =
    document.clinicalContext.facility?.name ??
    document.provenance.issuerName ??
    "ไม่ระบุแหล่งที่มา";
  const patientSummary =
    document.content.patientSummary?.summary?.th ??
    document.content.documentReference.description;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <RuntimeEnvironmentBanner />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="กลับไปหน้ารายการเอกสาร"
        onPress={() => router.back()}
        style={styles.back}
      >
        <ArrowLeft color="#344054" size={20} />
        <Text style={styles.backText}>เอกสารสุขภาพ</Text>
      </Pressable>

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <FileText color="#365f91" size={28} />
        </View>
        <Text style={styles.title}>{document.title.th}</Text>
        {document.title.en ? (
          <Text style={styles.englishTitle}>{document.title.en}</Text>
        ) : null}
        <View
          style={[
            styles.trustBadge,
            { backgroundColor: toneBackground(trust.tone) },
          ]}
        >
          <Text style={[styles.trustText, { color: toneColor(trust.tone) }]}>
            {trust.label}
          </Text>
        </View>
      </View>

      <Section title="ข้อมูลสำคัญ">
        <DetailRow label="แหล่งที่มา" value={source} />
        <DetailRow
          label="วันที่ทางคลินิก"
          value={documentDisplayDate(document)}
        />
        <DetailRow
          label="สถานะเอกสาร"
          value={lifecyclePresentation(document)}
        />
        {document.clinicalContext.practitioner?.name ? (
          <DetailRow
            label="ผู้ดูแล/ผู้บันทึก"
            value={document.clinicalContext.practitioner.name}
          />
        ) : null}
      </Section>

      {patientSummary ? (
        <Section title="สรุปสำหรับผู้ป่วย">
          <Text style={styles.paragraph}>{patientSummary}</Text>
        </Section>
      ) : null}

      <Section title="การตรวจสอบความน่าเชื่อถือ">
        <Text style={styles.explanation}>
          สถานะโดยรวมจะแสดงว่าตรวจสอบครบแล้วก็ต่อเมื่อหลักฐานความถูกต้อง ผู้ออก
          สถานะ วันหมดอายุ และเงื่อนไขการใช้งานผ่านจริง
        </Text>
        {document.trust.checks.map((check, index) => (
          <TrustCheckRow key={`${check.key}:${index}`} check={check} />
        ))}
      </Section>

      <Section title="เอกสารต้นฉบับ">
        {document.content.originalAttachments.length ? (
          document.content.originalAttachments.map((attachment) => (
            <Pressable
              key={attachment.id ?? attachment.url ?? attachment.title}
              disabled={!attachment.url}
              onPress={() =>
                attachment.url
                  ? void Linking.openURL(attachment.url)
                  : undefined
              }
              style={styles.attachment}
            >
              <Download color="#365f91" size={19} />
              <View style={styles.attachmentBody}>
                <Text style={styles.attachmentTitle}>
                  {attachment.title ?? "เอกสารต้นฉบับ"}
                </Text>
                <Text style={styles.attachmentMeta}>
                  {attachment.contentType}
                  {attachment.url ? " · เปิดดูได้" : " · ยังไม่มีไฟล์ในเครื่อง"}
                </Text>
              </View>
            </Pressable>
          ))
        ) : (
          <Text style={styles.explanation}>
            ไม่มีไฟล์ต้นฉบับแนบมากับรายการนี้
          </Text>
        )}
      </Section>

      <Section title="การใช้งานเมื่อไม่มีอินเทอร์เน็ต">
        <Text style={styles.explanation}>
          รายละเอียดรายการนี้อยู่ในคลังเอกสารบนอุปกรณ์ แต่ Wallet
          เวอร์ชันนี้ยังไม่ดาวน์โหลดไฟล์ต้นฉบับไว้ใช้ออฟไลน์
          การเปิดไฟล์ต้นฉบับจึงอาจต้องเชื่อมต่ออินเทอร์เน็ต
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function TrustCheckRow({ check }: { check: TrustCheck }) {
  const passed = check.status === "passed";
  const failed = check.status === "failed";
  const Icon = passed ? CheckCircle2 : failed ? ShieldAlert : Clock3;
  const color = passed ? "#0f7c55" : failed ? "#b42318" : "#9a6700";
  const labels: Record<string, string> = {
    proof: "ลายเซ็น/หลักฐาน",
    issuer: "ผู้ออกเอกสาร",
    status: "สถานะล่าสุด",
    expiry: "วันหมดอายุ",
    holder: "บุคคลเจ้าของเอกสาร",
    policy: "นโยบายการใช้งาน",
  };
  return (
    <View style={styles.checkRow}>
      <Icon color={color} size={19} />
      <View style={styles.checkBody}>
        <Text style={styles.checkTitle}>{labels[check.key] ?? check.key}</Text>
        <Text style={styles.checkDetail}>
          {check.detail ?? (passed ? "ผ่านการตรวจสอบ" : "ยังตรวจสอบไม่ครบ")}
        </Text>
      </View>
    </View>
  );
}

function CenteredState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.centered} accessibilityRole="alert">
      <Text style={styles.centeredTitle}>{title}</Text>
      {body ? <Text style={styles.centeredBody}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7f9" },
  content: { padding: 20, paddingTop: 28, paddingBottom: 80, gap: 14 },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8 },
  backText: { color: "#344054", fontWeight: "800" },
  hero: {
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dce3ee",
    padding: 20,
    alignItems: "flex-start",
    gap: 6,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#eaf2fb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  title: { color: "#182230", fontSize: 24, lineHeight: 31, fontWeight: "800" },
  englishTitle: { color: "#667085", fontSize: 13, lineHeight: 19 },
  trustBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 5,
  },
  trustText: { fontSize: 12, fontWeight: "800" },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dce3ee",
    backgroundColor: "#fff",
    padding: 16,
    gap: 10,
  },
  sectionTitle: { color: "#182230", fontSize: 17, fontWeight: "800" },
  detailRow: { gap: 3, paddingVertical: 3 },
  detailLabel: { color: "#667085", fontSize: 12 },
  detailValue: {
    color: "#344054",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  paragraph: { color: "#344054", fontSize: 14, lineHeight: 22 },
  explanation: { color: "#667085", fontSize: 13, lineHeight: 20 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkBody: { flex: 1, gap: 2 },
  checkTitle: { color: "#344054", fontSize: 13, fontWeight: "800" },
  checkDetail: { color: "#667085", fontSize: 12, lineHeight: 18 },
  attachment: {
    minHeight: 60,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  attachmentBody: { flex: 1, gap: 2 },
  attachmentTitle: { color: "#344054", fontSize: 13, fontWeight: "800" },
  attachmentMeta: { color: "#667085", fontSize: 11.5 },
  centered: {
    flex: 1,
    backgroundColor: "#f4f7f9",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 8,
  },
  centeredTitle: {
    color: "#182230",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  centeredBody: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
