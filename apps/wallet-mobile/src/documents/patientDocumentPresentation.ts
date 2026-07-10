import type { WalletDocumentRecordV2 } from "@trustcare/wallet-core";
import {
  isWalletDocumentTrustVerified,
  walletDocumentTrustPresentation,
} from "@trustcare/wallet-core";

export type PatientDocumentFilter = "all" | "current" | "attention";
export type PatientDocumentTone =
  "green" | "yellow" | "red" | "blue" | "neutral";

export function isCurrentPatientDocument(
  document: WalletDocumentRecordV2,
): boolean {
  return ![
    "superseded",
    "entered_in_error",
    "expired",
    "suspended",
    "revoked",
  ].includes(document.lifecycle.status);
}

export function patientTrustPresentation(document: WalletDocumentRecordV2): {
  label: string;
  tone: PatientDocumentTone;
} {
  const presentation = walletDocumentTrustPresentation(document);
  return { label: presentation.labelTh, tone: presentation.tone };
}

export function lifecyclePresentation(
  document: WalletDocumentRecordV2,
): string {
  const labels: Record<string, string> = {
    preliminary: "ฉบับเบื้องต้น",
    final: "ฉบับปัจจุบัน",
    amended: "แก้ไขเพิ่มเติม",
    corrected: "แก้ไขแล้ว",
    superseded: "มีฉบับใหม่แทนแล้ว",
    entered_in_error: "ยกเลิกเพราะข้อมูลผิด",
    expired: "หมดอายุ",
    suspended: "พักการใช้งาน",
    revoked: "ถูกเพิกถอน",
  };
  return labels[document.lifecycle.status] ?? document.lifecycle.status;
}

export function documentDisplayDate(document: WalletDocumentRecordV2): string {
  const value =
    document.clinicalContext.recordTime ??
    document.lifecycle.issuedAt ??
    document.provenance.receivedAt;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "ไม่ระบุวันที่";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function filterPatientDocuments(
  documents: readonly WalletDocumentRecordV2[],
  input: { search?: string; filter?: PatientDocumentFilter },
): WalletDocumentRecordV2[] {
  const search = input.search?.trim().toLocaleLowerCase();
  const filter = input.filter ?? "all";
  return documents.filter((document) => {
    if (filter === "current" && !isCurrentPatientDocument(document))
      return false;
    if (
      filter === "attention" &&
      isWalletDocumentTrustVerified(document) &&
      isCurrentPatientDocument(document)
    )
      return false;
    if (!search) return true;
    return [
      document.title.th,
      document.title.en,
      document.provenance.issuerName,
      document.clinicalContext.facility?.name,
      document.documentType,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(search));
  });
}

export function toneColor(tone: PatientDocumentTone): string {
  if (tone === "green") return "#0f7c55";
  if (tone === "yellow") return "#9a6700";
  if (tone === "red") return "#b42318";
  if (tone === "blue") return "#365f91";
  return "#667085";
}

export function toneBackground(tone: PatientDocumentTone): string {
  if (tone === "green") return "#e7f6ee";
  if (tone === "yellow") return "#fff4d6";
  if (tone === "red") return "#feeceb";
  if (tone === "blue") return "#eaf2fb";
  return "#f2f4f7";
}
