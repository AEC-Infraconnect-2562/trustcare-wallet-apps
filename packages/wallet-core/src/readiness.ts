import type { ReadinessContext, WalletCard } from "./models";

export const readinessContextLabels: Record<ReadinessContext, { th: string; en: string }> = {
  opd_visit: { th: "OPD / เข้ารับบริการทั่วไป", en: "OPD Visit" },
  emergency: { th: "ฉุกเฉิน", en: "Emergency" },
  referral: { th: "ส่งต่อ", en: "Referral" },
  cross_border: { th: "ข้ามเครือข่าย/ข้ามประเทศ", en: "Cross-border" },
  medical_tourist: { th: "ผู้ป่วยต่างชาติ", en: "Medical Tourist" },
  insurance_claim: { th: "เคลมประกัน", en: "Insurance Claim" },
  pharmacy_dispense: { th: "รับยา", en: "Pharmacy Dispense" }
};

const requirements: Record<ReadinessContext, string[]> = {
  opd_visit: ["patient_identity", "patient_summary"],
  emergency: ["patient_identity", "allergy_alert", "medication_summary"],
  referral: ["patient_identity", "referral_vc", "patient_summary"],
  cross_border: ["patient_identity", "referral_vc", "travel_document_verification"],
  medical_tourist: ["patient_identity", "quotation", "guarantee_letter"],
  insurance_claim: ["patient_identity", "insurance_eligibility", "claim_package"],
  pharmacy_dispense: ["patient_identity", "prescription", "allergy_alert"]
};

export function assessLocalReadiness(cards: WalletCard[], context: ReadinessContext) {
  const activeTypes = new Set(cards.filter(card => card.credentialStatus === "active").map(card => card.cardType));
  const required = requirements[context];
  const missing = required.filter(type => !activeTypes.has(type));
  const score = Math.round(((required.length - missing.length) / Math.max(required.length, 1)) * 100);
  return {
    context,
    score,
    criticalReady: missing.length === 0,
    required,
    missing,
    selectedCardIds: cards.filter(card => required.includes(card.cardType) && card.credentialStatus === "active").map(card => card.id)
  };
}

