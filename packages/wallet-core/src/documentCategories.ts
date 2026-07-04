export const documentCategories = {
  identity_and_access: { th: "ตัวตนและสิทธิ์", en: "Identity & Access", icon: "User" },
  clinical_summary: { th: "สรุปทางคลินิก", en: "Clinical Summary", icon: "FileText" },
  medication_and_pharmacy: { th: "ยาและเภสัชกรรม", en: "Medication & Pharmacy", icon: "Pill" },
  diagnostics_and_results: { th: "ผลตรวจและวินิจฉัย", en: "Diagnostics & Results", icon: "Microscope" },
  care_transition: { th: "ส่งต่อการดูแล", en: "Care Transition", icon: "ArrowRightLeft" },
  claims_and_finance: { th: "เคลมและการเงิน", en: "Claims & Finance", icon: "ReceiptText" },
  medical_tourism: { th: "ผู้ป่วยต่างชาติ", en: "Medical Tourism", icon: "Globe2" },
  sharing_and_sync: { th: "แชร์และซิงก์", en: "Sharing & Sync", icon: "RefreshCcw" },
  operations: { th: "ปฏิบัติการ", en: "Operations", icon: "CalendarDays" }
} as const;

export type DocumentCategory = keyof typeof documentCategories;

export const allDocumentCategories = Object.keys(documentCategories) as DocumentCategory[];
