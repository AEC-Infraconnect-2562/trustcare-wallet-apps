export function credentialDocumentVariant(cardType: string): string {
  if (cardType.includes("identity")) return "identity";
  if (["lab_result", "diagnostic_report"].includes(cardType)) {
    return "diagnostic";
  }
  if (
    ["prescription", "medication_summary", "pharmacy_dispense"].includes(
      cardType,
    )
  ) {
    return "medication";
  }
  if (
    [
      "claim_package",
      "claim_receipt",
      "quotation",
      "guarantee_letter",
      "insurance_eligibility",
    ].includes(cardType)
  ) {
    return "finance";
  }
  if (cardType === "allergy_alert") return "alert";
  if (cardType === "shl_manifest") return "manifest";
  return "clinical";
}

export function credentialDocumentAccent(cardType: string): string {
  const map: Record<string, string> = {
    allergy_alert: "#b91c1c",
    lab_result: "#365dd8",
    diagnostic_report: "#365dd8",
    prescription: "#1f7a5a",
    medication_summary: "#1f7a5a",
    pharmacy_dispense: "#1f7a5a",
    insurance_eligibility: "#9a6a0a",
    claim_package: "#9a4b0a",
    claim_receipt: "#9a4b0a",
    quotation: "#9a4b0a",
    guarantee_letter: "#0f766e",
    shl_manifest: "#52525b",
    appointment: "#4f46e5",
  };
  return map[cardType] ?? "#405a9b";
}

export function credentialDocumentKindLabel(cardType: string): string {
  const map: Record<string, string> = {
    patient_summary: "Clinical summary",
    allergy_alert: "Safety alert",
    immunization: "Immunization record",
    medical_certificate: "Medical certificate",
    medication_summary: "Medication profile",
    prescription: "Prescription order",
    pharmacy_dispense: "Pharmacy dispense",
    lab_result: "Laboratory report",
    diagnostic_report: "Diagnostic report",
    referral_vc: "Referral letter",
    discharge_summary: "Discharge summary",
    insurance_eligibility: "Coverage eligibility",
    claim_package: "Claim package",
    claim_receipt: "Payment receipt",
    travel_document_verification: "Travel document verification",
    visa_support_letter: "Visa support letter",
    quotation: "Treatment quotation",
    guarantee_letter: "Guarantee letter",
    shl_manifest: "SHL manifest",
    sync_receipt: "Sync receipt",
    appointment: "Appointment slip",
  };
  return map[cardType] ?? "Clinical document";
}
