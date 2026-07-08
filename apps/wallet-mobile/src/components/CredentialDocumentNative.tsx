import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import type {
  PortablePresentationEnvelope,
  WalletCard,
} from "@trustcare/wallet-core";

export function CredentialDocumentNative({
  card,
  envelope,
  qrValue,
}: {
  card: WalletCard;
  envelope: PortablePresentationEnvelope;
  qrValue?: string;
}) {
  const identitySection = envelope.sections.find(
    (section) => section.kind === "identity",
  );
  const bodySections = envelope.sections
    .filter(
      (section) =>
        section.kind !== "technical" && section.key !== identitySection?.key,
    )
    .slice(0, 4);

  return (
    <View style={styles.doc}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>TC</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.hospital} numberOfLines={2}>
            {envelope.issuer?.name ??
              card.issuerHospitalName ??
              "TrustCare Issuer"}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {envelope.display.title}
          </Text>
          {envelope.display.titleEn ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {envelope.display.titleEn}
            </Text>
          ) : null}
        </View>
        <Text
          style={[styles.statusPill, statusPillStyle(envelope.trust.badge)]}
        >
          {trustLabel(envelope.trust.status)}
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.ownerLabel}>ผู้ถือเอกสาร</Text>
        <Text style={styles.name}>{envelope.subject.displayName ?? "-"}</Text>
        {identitySection ? (
          <FieldGrid fields={identitySection.fields.slice(0, 4)} />
        ) : null}
      </View>

      {bodySections.map((section) => (
        <View key={section.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <FieldGrid fields={section.fields.slice(0, 6)} />
        </View>
      ))}

      <View style={styles.evidence}>
        <View style={styles.evidenceText}>
          <Text style={styles.label}>Credential ID</Text>
          <Text style={styles.mono} numberOfLines={2}>
            {String(card.credentialId)}
          </Text>
        </View>
        <View style={styles.qr}>
          {qrValue ? <QRCode value={qrValue} size={76} /> : <Text>QR</Text>}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {envelope.trust.checklist.filter((item) => item.ok).length}/
          {envelope.trust.checklist.length} trust checks ·{" "}
          {envelope.provenance.sourceSystem ?? "wallet"}
        </Text>
      </View>
    </View>
  );
}

function FieldGrid({
  fields,
}: {
  fields: PortablePresentationEnvelope["sections"][number]["fields"];
}) {
  if (!fields.length) return null;
  return (
    <View style={styles.fieldGrid}>
      {fields.map((field) => (
        <View key={field.path ?? field.label} style={styles.field}>
          <Text style={styles.label} numberOfLines={1}>
            {field.label}
          </Text>
          <Text style={styles.value} numberOfLines={3}>
            {displayValue(field.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  return JSON.stringify(value);
}

function trustLabel(
  status: PortablePresentationEnvelope["trust"]["status"],
): string {
  const labels: Record<
    PortablePresentationEnvelope["trust"]["status"],
    string
  > = {
    issuer_signed: "ลงนามแล้ว",
    transport_valid: "ขนส่งถูกต้อง",
    trustcare_pending: "รอรับรอง",
    trustcare_certified: "รับรองแล้ว",
    patient_provided_unverified: "ผู้ใช้เพิ่มเอง",
    invalid_or_revoked: "ใช้ไม่ได้",
    metadata_only: "metadata",
    proof_missing: "ไม่มี proof",
  };
  return labels[status];
}

function statusPillStyle(
  badge: PortablePresentationEnvelope["trust"]["badge"],
) {
  if (badge === "green") return styles.statusPillGreen;
  if (badge === "yellow") return styles.statusPillYellow;
  if (badge === "red") return styles.statusPillRed;
  return styles.statusPillNeutral;
}

const styles = StyleSheet.create({
  doc: {
    overflow: "hidden",
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8dfe4",
    borderBottomWidth: 6,
    borderBottomColor: "#c7ac2e",
    marginBottom: 18,
  },
  header: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#344b83",
    padding: 16,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  headerText: { flex: 1 },
  hospital: { color: "#fff", fontSize: 15, fontWeight: "800" },
  title: { color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 2 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 12 },
  statusPill: {
    overflow: "hidden",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusPillGreen: { backgroundColor: "#d8f8e5", color: "#0b6b42" },
  statusPillYellow: { backgroundColor: "#fff3c4", color: "#8a5808" },
  statusPillRed: { backgroundColor: "#fee2e2", color: "#991b1b" },
  statusPillNeutral: { backgroundColor: "#e2e8f0", color: "#475569" },
  body: { padding: 16, gap: 6 },
  ownerLabel: { color: "#62718a", fontSize: 12 },
  name: { color: "#0f172a", fontSize: 20, fontWeight: "800" },
  fieldGrid: { gap: 8, marginTop: 8 },
  field: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    padding: 10,
  },
  label: { color: "#647084", fontSize: 11, fontWeight: "700" },
  value: { color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 },
  section: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    padding: 16,
  },
  sectionTitle: { color: "#172033", fontSize: 14, fontWeight: "800" },
  evidence: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8dfe4",
    backgroundColor: "#f3f6fa",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  evidenceText: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 12, color: "#111827" },
  qr: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8dfe4",
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
  },
  footerText: { color: "#62718a", fontSize: 11 },
});
