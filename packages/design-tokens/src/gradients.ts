export const walletCardGradients = {
  allergy: ["#ef4444", "#b91c1c"],
  allergy_alert: ["#ef4444", "#b91c1c"],
  medication: ["#3b82f6", "#1d4ed8"],
  medication_summary: ["#3b82f6", "#1d4ed8"],
  patient_summary: ["#10b981", "#047857"],
  consent: ["#8b5cf6", "#6d28d9"],
  consent_receipt: ["#8b5cf6", "#6d28d9"],
  identity: ["#475569", "#1e293b"],
  patient_identity: ["#4f67f2", "#1d3d9d"],
  staff_identity: ["#475569", "#1e293b"],
  immunization: ["#f59e0b", "#b45309"],
  referral: ["#06b6d4", "#0e7490"],
  referral_vc: ["#06b6d4", "#0e7490"],
  medical_certificate: ["#0d9488", "#115e59"],
  prescription: ["#0284c7", "#075985"],
  lab_result: ["#65a30d", "#3f6212"],
  diagnostic_report: ["#4f46e5", "#3730a3"],
  discharge_summary: ["#16a34a", "#166534"],
  coverage: ["#059669", "#065f46"],
  insurance_eligibility: ["#059669", "#065f46"],
  claim: ["#e11d48", "#9f1239"],
  claim_package: ["#e11d48", "#9f1239"],
  claim_receipt: ["#e11d48", "#9f1239"],
  travel_document: ["#0891b2", "#155e75"],
  travel_document_verification: ["#0891b2", "#155e75"],
  shl_manifest: ["#52525b", "#27272a"],
  pharmacy_dispense: ["#2563eb", "#1e40af"],
  appointment: ["#9333ea", "#6b21a8"],
  visa_support_letter: ["#c026d3", "#86198f"],
  quotation: ["#ea580c", "#9a3412"],
  guarantee_letter: ["#ca8a04", "#854d0e"],
  mpi_link_certificate: ["#57534e", "#292524"],
  sync_receipt: ["#475569", "#1e293b"],
  transcript: ["#36a36f", "#26704f"],
  open_badge: ["#f59e0b", "#d97706"]
} as const;

export type WalletCardGradientKey = keyof typeof walletCardGradients;

export function gradientForCardType(cardType: string): readonly [string, string] {
  return (walletCardGradients as Record<string, readonly [string, string]>)[cardType] ?? walletCardGradients.identity;
}

