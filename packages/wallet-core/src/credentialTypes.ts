export const photoBearingCredentialTypes = [
  "patient_identity",
  "staff_identity",
  "identity",
  "medical_certificate",
  "patient_summary",
  "student_identity"
] as const;

export const identityCredentialTypes = [
  "patient_identity",
  "identity",
  "student_identity",
  "staff_identity",
  "mpi_link_certificate"
] as const;

export const credentialTypeLabels: Record<string, { th: string; en: string }> = {
  patient_identity: { th: "บัตรประจำตัวผู้ป่วย", en: "Patient ID Card" },
  student_identity: { th: "บัตรนักศึกษา", en: "Student ID Card" },
  patient_summary: { th: "สรุปข้อมูลผู้ป่วย", en: "Patient Summary" },
  allergy_alert: { th: "แจ้งเตือนการแพ้", en: "Allergy Alert" },
  medication_summary: { th: "สรุปรายการยา", en: "Medication Summary" },
  prescription: { th: "ใบสั่งยา", en: "Prescription" },
  lab_result: { th: "ผลตรวจแล็บ", en: "Lab Result" },
  medical_certificate: { th: "ใบรับรองแพทย์", en: "Medical Certificate" },
  shl_manifest: { th: "SHL Manifest", en: "SHL Manifest" },
  transcript: { th: "Transcript", en: "Transcript" }
};

export function labelForCredentialType(type: string, lang: "th" | "en" = "th"): string {
  return credentialTypeLabels[type]?.[lang] ?? type;
}
