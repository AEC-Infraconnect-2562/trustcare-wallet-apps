import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Building2, ShieldAlert, ShieldCheck } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import {
  credentialRenderModelFromCard,
  displayCredentialValue,
  type CredentialPaperSection,
  type CredentialRenderField,
  type PhotoCandidate,
  type PortablePresentationEnvelope,
  type WalletCard,
} from "@trustcare/wallet-core";
import { photoCandidatesForNativeDocument } from "./credentialDocumentPhotoPolicy";

export function CredentialDocumentNative({
  card,
  envelope,
  qrValue,
}: {
  card: WalletCard;
  envelope: PortablePresentationEnvelope;
  qrValue?: string;
}) {
  const renderModel = credentialRenderModelFromCard(card);
  const paper = renderModel.paper;
  const issuerName = paper.letterhead.nameTh ?? paper.letterhead.nameEn;
  const photoCandidates = photoCandidatesForNativeDocument(
    card,
    renderModel.documentType,
  );
  const holderSectionTitle =
    renderModel.documentType === "staff_identity"
      ? { th: "ข้อมูลผู้ถือเอกสาร", en: "DOCUMENT HOLDER" }
      : { th: "ข้อมูลผู้ป่วย", en: "PATIENT INFORMATION" };

  return (
    <View style={styles.paper}>
      {paper.watermark ? (
        <Text style={styles.watermark}>{paper.watermark}</Text>
      ) : null}

      <View style={styles.letterhead}>
        {paper.letterhead.logoUrl ? (
          <Image
            source={{ uri: paper.letterhead.logoUrl }}
            style={styles.issuerLogo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.issuerIcon}>
            <Building2 color="#244b72" size={25} />
          </View>
        )}
        <View style={styles.letterheadCopy}>
          <Text style={issuerName ? styles.issuerName : styles.missingIssuer}>
            {issuerName ?? "ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ"}
          </Text>
          {paper.letterhead.nameTh && paper.letterhead.nameEn ? (
            <Text style={styles.issuerNameEn}>{paper.letterhead.nameEn}</Text>
          ) : null}
          {paper.letterhead.address ? (
            <Text style={styles.issuerContact}>{paper.letterhead.address}</Text>
          ) : null}
          {paper.letterhead.phone ? (
            <Text style={styles.issuerContact}>{paper.letterhead.phone}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{paper.title.th}</Text>
        {paper.title.en ? (
          <Text style={styles.subtitle}>{paper.title.en}</Text>
        ) : null}
        {paper.generic ? (
          <Text style={styles.genericLabel}>รูปแบบทั่วไป / Generic view</Text>
        ) : null}
      </View>

      <FieldGrid
        fields={paper.metadataFields.filter(
          (field) =>
            field.path !== "credential.id" &&
            field.path !== "credential.issuer",
        )}
        style={styles.metaGrid}
      />

      {paper.patientFields.length || photoCandidates.length ? (
        <View style={styles.patientBlock}>
          <SectionHeading
            title={holderSectionTitle.th}
            titleEn={holderSectionTitle.en}
          />
          <View
            style={[
              styles.patientContent,
              photoCandidates.length ? styles.patientWithPhoto : undefined,
            ]}
          >
            <CredentialHolderPhotoNative candidates={photoCandidates} />
            <FieldGrid
              fields={paper.patientFields}
              style={styles.patientFields}
            />
          </View>
        </View>
      ) : null}

      {paper.sections.map((section) => (
        <PaperSectionNative key={section.key} section={section} />
      ))}

      {paper.signatories.map((signatory, index) => (
        <View
          style={styles.signature}
          key={`${signatory.name ?? "signatory"}:${index}`}
        >
          {signatory.name ? (
            <Text style={styles.signatureName}>{signatory.name}</Text>
          ) : null}
          {signatory.role ? (
            <Text style={styles.muted}>{signatory.role}</Text>
          ) : null}
          {signatory.licenseNo ? (
            <Text style={styles.muted}>{signatory.licenseNo}</Text>
          ) : null}
          {signatory.organization ? (
            <Text style={styles.muted}>{signatory.organization}</Text>
          ) : null}
        </View>
      ))}

      <View style={styles.verification}>
        <View style={styles.verificationHeading}>
          {envelope.trust.status === "invalid_or_revoked" ? (
            <ShieldAlert color="#a12c2c" size={18} />
          ) : (
            <ShieldCheck color="#9a6518" size={18} />
          )}
          <View style={styles.verificationCopy}>
            <Text style={styles.verificationTitle}>
              {envelope.kind === "presentation"
                ? "VP พร้อมให้ผู้รับตรวจสอบ"
                : "ยังไม่ได้ตรวจสอบเพื่อวัตถุประสงค์การใช้งาน"}
            </Text>
            <Text style={styles.muted}>
              มีหลักฐาน{" "}
              {envelope.trust.checklist.filter((item) => item.ok).length}/
              {envelope.trust.checklist.length} รายการใน Wallet
            </Text>
          </View>
        </View>
        <Text style={styles.label}>Credential ID</Text>
        <Text style={styles.mono}>{String(card.credentialId)}</Text>
        {paper.evidence.length ? (
          <Text style={styles.muted}>
            Evidence {paper.evidence.length} รายการ
          </Text>
        ) : null}
        {qrValue ? (
          <View style={styles.qr}>
            <QRCode value={qrValue} size={76} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CredentialHolderPhotoNative({
  candidates,
}: {
  candidates: PhotoCandidate[];
}) {
  const candidateListKey = candidates
    .map((candidate) => candidate.url)
    .join("\0");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const candidate = candidates[candidateIndex];

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateListKey]);

  if (!candidate) return null;

  return (
    <Image
      accessibilityLabel="รูปจากข้อมูลประจำตัวในเอกสาร"
      key={candidate.url}
      source={{ uri: candidate.url }}
      style={styles.patientPhoto}
      resizeMode="cover"
      onError={() => {
        setCandidateIndex((index) =>
          candidates[index]?.url === candidate.url ? index + 1 : index,
        );
      }}
    />
  );
}

function PaperSectionNative({ section }: { section: CredentialPaperSection }) {
  return (
    <View
      style={[
        styles.section,
        section.kind === "alert" ? styles.alertSection : undefined,
      ]}
    >
      <SectionHeading title={section.title} titleEn={section.titleEn} />
      {section.kind === "fields" ? (
        <FieldGrid fields={section.fields ?? []} />
      ) : null}
      {section.kind === "table" ? (
        <View style={styles.tableRows}>
          {(section.rows ?? []).map((row, rowIndex) => (
            <View style={styles.tableRow} key={`${section.key}:${rowIndex}`}>
              {(section.columns ?? []).map((column) => (
                <View style={styles.tableCell} key={column.key}>
                  <Text style={styles.label}>
                    {column.label}
                    {column.labelEn ? ` / ${column.labelEn}` : ""}
                  </Text>
                  <Text
                    style={[
                      styles.value,
                      column.align === "end" ? styles.numericValue : undefined,
                    ]}
                  >
                    {displayCredentialValue(row[column.key])}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {section.kind === "note" || section.kind === "letter" ? (
        <PaperBodyNative value={section.body} />
      ) : null}
      {section.kind === "alert" ? (
        <FieldGrid fields={section.fields ?? []} />
      ) : null}
    </View>
  );
}

function SectionHeading({
  title,
  titleEn,
}: {
  title: string;
  titleEn?: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {titleEn ? <Text style={styles.sectionTitleEn}>{titleEn}</Text> : null}
    </View>
  );
}

function FieldGrid({
  fields,
  style,
}: {
  fields: CredentialRenderField[];
  style?: object;
}) {
  if (!fields.length) return null;
  return (
    <View style={[styles.fieldGrid, style]}>
      {fields.map((field) => (
        <View key={field.path ?? field.label} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <Text style={styles.value}>
            {displayCredentialValue(field.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PaperBodyNative({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <View style={styles.noteList}>
        {value.map((item, index) => (
          <Text style={styles.note} key={index}>
            • {displayCredentialValue(item)}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={styles.note}>{displayCredentialValue(value)}</Text>;
}

const styles = StyleSheet.create({
  paper: {
    position: "relative",
    overflow: "hidden",
    marginBottom: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#cfd5db",
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  watermark: {
    position: "absolute",
    top: "48%",
    alignSelf: "center",
    color: "rgba(89,99,111,0.08)",
    fontSize: 42,
    fontWeight: "900",
    transform: [{ rotate: "-32deg" }],
  },
  letterhead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: "#17202a",
  },
  issuerIcon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#aeb6bf",
    borderRadius: 7,
    backgroundColor: "#f3f5f6",
  },
  issuerLogo: {
    width: 50,
    height: 50,
    borderWidth: 1,
    borderColor: "#d9dee3",
    borderRadius: 7,
  },
  letterheadCopy: { flex: 1, minWidth: 0 },
  issuerName: { color: "#17202a", fontSize: 16, fontWeight: "800" },
  missingIssuer: { color: "#8a4b11", fontSize: 13, fontWeight: "700" },
  issuerNameEn: { marginTop: 2, color: "#59636f", fontSize: 12 },
  issuerContact: { marginTop: 2, color: "#59636f", fontSize: 10.5 },
  titleBlock: { alignItems: "center", gap: 4, paddingVertical: 22 },
  title: {
    color: "#17202a",
    fontSize: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#59636f",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  genericLabel: { marginTop: 5, color: "#59636f", fontSize: 10.5 },
  metaGrid: { padding: 10, backgroundColor: "#f3f5f6" },
  patientBlock: { marginTop: 16 },
  patientContent: { alignItems: "flex-start" },
  patientWithPhoto: { flexDirection: "row", gap: 12 },
  patientPhoto: {
    width: 72,
    height: 92,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "#cfd5db",
    borderRadius: 4,
    backgroundColor: "#f3f5f6",
  },
  patientFields: { flex: 1, minWidth: 0 },
  section: { marginTop: 18 },
  alertSection: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#a83c3c",
    backgroundColor: "#fff7f7",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#aeb6bf",
  },
  sectionTitle: { flex: 1, color: "#17202a", fontSize: 14, fontWeight: "800" },
  sectionTitleEn: { color: "#59636f", fontSize: 9.5, fontWeight: "600" },
  fieldGrid: { gap: 7 },
  field: { flexDirection: "row", gap: 10, paddingVertical: 3 },
  label: { flex: 0.8, color: "#59636f", fontSize: 10.5, fontWeight: "700" },
  value: { flex: 1.2, color: "#17202a", fontSize: 12, fontWeight: "600" },
  numericValue: { textAlign: "right", fontVariant: ["tabular-nums"] },
  tableRows: { gap: 8 },
  tableRow: {
    padding: 10,
    borderWidth: 1,
    borderColor: "#d9dee3",
    backgroundColor: "#fafbfc",
  },
  tableCell: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  noteList: { gap: 4 },
  note: { color: "#39434e", fontSize: 11.5, lineHeight: 18 },
  signature: {
    width: "74%",
    alignSelf: "flex-end",
    alignItems: "center",
    marginTop: 30,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#17202a",
  },
  signatureName: { color: "#17202a", fontSize: 12, fontWeight: "800" },
  verification: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#aeb6bf",
  },
  verificationHeading: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginBottom: 10,
  },
  verificationCopy: { flex: 1 },
  verificationTitle: { color: "#17202a", fontSize: 11.5, fontWeight: "800" },
  muted: { color: "#59636f", fontSize: 10.5 },
  mono: { color: "#17202a", fontFamily: "Courier", fontSize: 10.5 },
  qr: {
    alignSelf: "flex-end",
    marginTop: 10,
    padding: 6,
    backgroundColor: "#fff",
  },
});
