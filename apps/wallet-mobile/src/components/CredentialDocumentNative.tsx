import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Building2, ShieldAlert, ShieldCheck } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import {
  credentialRenderModelFromCard,
  displayCredentialValue,
  type CredentialPaperModel,
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

  if (paper.formFactor.kind === "iso_id_1") {
    return (
      <CredentialIdentityCardNative
        paper={paper}
        envelope={envelope}
        qrValue={qrValue}
        photoCandidates={photoCandidates}
      />
    );
  }

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

function CredentialIdentityCardNative({
  paper,
  envelope,
  qrValue,
  photoCandidates,
}: {
  paper: CredentialPaperModel;
  envelope: PortablePresentationEnvelope;
  qrValue?: string;
  photoCandidates: PhotoCandidate[];
}) {
  const fieldByLabel = (label: string) =>
    paper.patientFields.find((field) => field.label === label);
  const metadataByPath = (path: string) =>
    paper.metadataFields.find((field) => field.path === path);
  const issuerName = paper.letterhead.nameTh ?? paper.letterhead.nameEn;
  const nameTh = fieldByLabel("ชื่อ-นามสกุล");
  const nameEn = fieldByLabel("Name");
  const identifiers = paper.patientFields
    .filter((field) =>
      ["HN", "CarePass ID", "เลขประจำตัว"].includes(field.label),
    )
    .slice(0, 2);
  const status = metadataByPath("document.status");
  const issuedAt = metadataByPath("document.issuedAt");
  const expiresAt = metadataByPath("document.expiresAt");
  const trustLabel =
    envelope.trust.status === "invalid_or_revoked"
      ? "ตรวจสอบไม่ผ่าน"
      : "ยังไม่ได้ตรวจสอบ";

  return (
    <View accessibilityLabel={paper.title.th} style={styles.identityCard}>
      {paper.watermark ? (
        <Text style={styles.identityWatermark}>{paper.watermark}</Text>
      ) : null}
      <View style={styles.identityHeader}>
        {paper.letterhead.logoUrl ? (
          <Image
            source={{ uri: paper.letterhead.logoUrl }}
            style={styles.identityIssuerMark}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.identityIssuerMark}>
            <Building2 color="#244b72" size={18} />
          </View>
        )}
        <View style={styles.identityIssuerCopy}>
          <Text style={styles.identityIssuerName} numberOfLines={1}>
            {issuerName ?? "ไม่พบชื่อผู้ออกเอกสารในข้อมูลต้นฉบับ"}
          </Text>
          {paper.letterhead.nameTh && paper.letterhead.nameEn ? (
            <Text style={styles.identityIssuerNameEn} numberOfLines={1}>
              {paper.letterhead.nameEn}
            </Text>
          ) : null}
        </View>
        {status ? (
          <Text style={styles.identityStatus} numberOfLines={1}>
            {displayCredentialValue(status.value)}
          </Text>
        ) : null}
      </View>

      <View style={styles.identityMain}>
        <CredentialHolderPhotoNative candidates={photoCandidates} compact />
        <View style={styles.identityHolder}>
          <Text style={styles.identityKicker}>{paper.title.th}</Text>
          <Text style={styles.identityName} numberOfLines={1}>
            {nameTh
              ? displayCredentialValue(nameTh.value)
              : "ไม่พบชื่อผู้ถือเอกสารในข้อมูลต้นฉบับ"}
          </Text>
          {nameEn ? (
            <Text style={styles.identityNameEn} numberOfLines={1}>
              {displayCredentialValue(nameEn.value)}
            </Text>
          ) : null}
          <View style={styles.identityIdentifiers}>
            {identifiers.map((field) => (
              <View
                style={styles.identityIdentifier}
                key={field.path ?? field.label}
              >
                <Text style={styles.identityFieldLabel}>{field.label}</Text>
                <Text style={styles.identityFieldValue} numberOfLines={1}>
                  {displayCredentialValue(field.value)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.identityFooter}>
        <View style={styles.identityValidity}>
          {issuedAt ? (
            <View>
              <Text style={styles.identityFieldLabel}>ออกเมื่อ</Text>
              <Text style={styles.identityDate}>
                {displayCredentialValue(issuedAt.value)}
              </Text>
            </View>
          ) : null}
          {expiresAt ? (
            <View>
              <Text style={styles.identityFieldLabel}>ใช้ได้ถึง</Text>
              <Text style={styles.identityDate}>
                {displayCredentialValue(expiresAt.value)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.identityTrust}>
          <ShieldAlert color="#9a6518" size={13} />
          <Text style={styles.identityTrustText}>{trustLabel}</Text>
        </View>
        {qrValue ? <QRCode value={qrValue} size={38} /> : null}
      </View>
    </View>
  );
}

function CredentialHolderPhotoNative({
  candidates,
  compact = false,
}: {
  candidates: PhotoCandidate[];
  compact?: boolean;
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
      style={[styles.patientPhoto, compact ? styles.identityPhoto : undefined]}
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
  identityCard: {
    position: "relative",
    width: "100%",
    aspectRatio: 85.6 / 53.98,
    overflow: "hidden",
    marginBottom: 18,
    padding: 12,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: "#c8d1dc",
    borderTopColor: "#244b72",
    borderRadius: 15,
    backgroundColor: "#fff",
  },
  identityWatermark: {
    position: "absolute",
    top: "42%",
    alignSelf: "center",
    color: "rgba(89,99,111,0.07)",
    fontSize: 24,
    fontWeight: "900",
    transform: [{ rotate: "-28deg" }],
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#d9dee3",
  },
  identityIssuerMark: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c8d1dc",
    borderRadius: 8,
    backgroundColor: "#f3f5f6",
  },
  identityIssuerCopy: { flex: 1, minWidth: 0 },
  identityIssuerName: { color: "#17202a", fontSize: 11, fontWeight: "800" },
  identityIssuerNameEn: { marginTop: 1, color: "#59636f", fontSize: 8 },
  identityStatus: {
    maxWidth: 72,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#edf7f1",
    color: "#236746",
    fontSize: 8,
    fontWeight: "800",
  },
  identityMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  identityPhoto: {
    width: 56,
    height: 70,
    borderRadius: 7,
  },
  identityHolder: { flex: 1, minWidth: 0 },
  identityKicker: { color: "#244b72", fontSize: 8, fontWeight: "800" },
  identityName: {
    marginTop: 2,
    color: "#17202a",
    fontSize: 16,
    fontWeight: "900",
  },
  identityNameEn: { color: "#59636f", fontSize: 9 },
  identityIdentifiers: { flexDirection: "row", gap: 6, marginTop: 6 },
  identityIdentifier: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f3f5f6",
  },
  identityFieldLabel: { color: "#59636f", fontSize: 7, fontWeight: "700" },
  identityFieldValue: { color: "#17202a", fontSize: 9, fontWeight: "800" },
  identityFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#d9dee3",
  },
  identityValidity: { flex: 1, flexDirection: "row", gap: 10 },
  identityDate: { color: "#17202a", fontSize: 8, fontWeight: "700" },
  identityTrust: { flexDirection: "row", alignItems: "center", gap: 4 },
  identityTrustText: { color: "#8a5b11", fontSize: 7, fontWeight: "700" },
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
