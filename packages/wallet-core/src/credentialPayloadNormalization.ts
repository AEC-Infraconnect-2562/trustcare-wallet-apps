import { mergePortalRenderPayload } from "./portalRenderContract";
import type { CredentialRenderItem } from "./credentialRendererTypes";
import {
  benefitItems,
  displayName,
  firstNonEmptyItems,
  firstText,
  formatValue,
  getNested,
  getObject,
  getText,
  joinDateTime,
} from "./credentialRenderPrimitives";

export function labReportPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const report = mergeDocumentPayload(subject, [
    "labReport",
    "laboratoryReport",
  ]);
  return {
    ...report,
    reportNo: firstText(
      getText(report, "reportNo"),
      getText(report, "documentNo"),
    ),
    laboratory: firstText(
      getText(report, "laboratory"),
      displayName(getObject(report, "performedBy")),
      displayName(getObject(report, "organization")),
    ),
    specimenCollectedAt: firstText(
      getText(report, "specimenCollectedAt"),
      getText(getObject(report, "specimen"), "collectedAt"),
      getText(report, "reportedAt"),
    ),
    reportedAt: firstText(
      getText(report, "reportedAt"),
      getText(report, "issuedAt"),
    ),
    observations: firstNonEmptyItems(
      getNested(report, ["observations"]),
      getNested(subject, ["observations"]),
      getNested(getObject(report, "fhir"), ["observations"]),
      getNested(getObject(subject, "fhir"), ["observations"]),
    ).map((item) => ({
      ...item,
      display: firstText(
        getText(item, "display"),
        getText(item, "nameTh"),
        getText(item, "name"),
        getText(item, "loincCode"),
      ),
      value: firstText(getText(item, "value"), getText(item, "interpretation")),
      unit: firstText(getText(item, "unit"), getText(item, "referenceRange")),
      flag: firstText(getText(item, "flag"), getText(item, "interpretation")),
    })),
  };
}

export function diagnosticReportPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const report = mergeDocumentPayload(subject, ["diagnosticReport"]);
  return {
    ...report,
    reportNo: firstText(
      getText(report, "reportNo"),
      getText(report, "documentNo"),
    ),
    category: firstText(
      getText(report, "category"),
      getText(report, "reportType"),
      getText(report, "documentType"),
    ),
    effectiveDateTime: firstText(
      getText(report, "effectiveDateTime"),
      getText(report, "reportedAt"),
      getText(report, "issuedAt"),
    ),
    observations: firstNonEmptyItems(
      getNested(report, ["observations"]),
      getNested(getObject(report, "fhir"), ["observations"]),
    ),
  };
}

export function immunizationItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["immunizationRecord", "items"]),
    getNested(subject, ["immunizationRecord", "immunizations"]),
    getNested(subject, ["immunizations"]),
    getNested(getObject(subject, "fhir"), ["immunizations"]),
  );
}

export function prescriptionItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["prescription", "items"]),
    getNested(subject, ["prescription", "medications"]),
    getNested(subject, ["prescribedMedications"]),
    getNested(subject, ["medicationsPrescribed"]),
    getNested(subject, ["items"]),
    getNested(subject, ["medications"]),
    getNested(getObject(subject, "fhir"), ["medicationRequests"]),
  ).map(normalizeMedicationItem);
}

export function medicationSummaryItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["medicationSummary", "medications"]),
    getNested(subject, ["medicationSummary", "items"]),
    getNested(subject, ["currentMedications"]),
    getNested(subject, ["medications"]),
    getNested(subject, ["items"]),
    getNested(getObject(subject, "fhir"), ["medicationRequests"]),
  ).map(normalizeMedicationItem);
}

export function pharmacyDispenseItems(
  subject: CredentialRenderItem,
): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["pharmacyDispense", "items"]),
    getNested(subject, ["dispensingRecord", "items"]),
    getNested(subject, ["medicationDispense", "items"]),
    getNested(subject, ["dispensedItems"]),
    getNested(subject, ["items"]),
  ).map(normalizeMedicationItem);
}

export function allergyItems(subject: CredentialRenderItem): CredentialRenderItem[] {
  return firstNonEmptyItems(
    getNested(subject, ["allergyAlert", "items"]),
    getNested(subject, ["allergyAlert", "allergies"]),
    getNested(subject, ["allergyInformation", "items"]),
    getNested(subject, ["allergyInformation", "allergies"]),
    getNested(subject, ["allergyIntolerances"]),
    getNested(subject, ["allergies"]),
    getNested(getObject(subject, "critical"), ["allergies"]),
  ).map((item) => ({
    ...item,
    substance: firstText(
      getText(item, "substance"),
      getText(item, "agent"),
      getText(item, "display"),
      getText(item, "label"),
    ),
    reaction: firstText(
      getText(item, "reactionTh"),
      getText(item, "reaction"),
      getText(item, "manifestation"),
    ),
    severity: firstText(
      getText(item, "severity"),
      getText(item, "criticality"),
    ),
  }));
}

export function medicalCertificatePayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const certificate = mergeDocumentPayload(subject, [
    "medicalCertificate",
    "certificate",
    "certification",
  ]);
  const fit =
    getNested(certificate, ["fitnessForWork", "fit"]) ??
    getNested(certificate, ["fitnessForWork"]) ??
    getNested(certificate, ["fitForWork"]);
  return {
    ...certificate,
    certificateNo: firstText(
      getText(certificate, "certificateNo"),
      getText(certificate, "documentNo"),
    ),
    type: firstText(
      getText(certificate, "type"),
      getText(certificate, "certificateType"),
      getText(certificate, "issuedFor"),
      getText(certificate, "documentType"),
    ),
    result: firstText(
      getText(certificate, "result"),
      getText(certificate, "diagnosisText"),
      fit === true
        ? "แพทย์ผู้ตรวจรับรองว่าผู้ป่วยสามารถรับบริการหรือปฏิบัติงานได้ตามแพทย์เห็นสมควร"
        : undefined,
    ),
    examinationDate: firstText(
      getText(certificate, "examinationDate"),
      getText(certificate, "issuedAt"),
    ),
    restrictions: firstText(
      getText(certificate, "restrictions"),
      getText(certificate, "recommendations"),
    ),
    fitnessForWork:
      getObject(certificate, "fitnessForWork") ??
      (fit !== undefined ? { fit } : undefined),
    practitioner:
      getObject(certificate, "practitioner") ??
      getObject(certificate, "certifyingPractitioner"),
  };
}

export function clinicalSummaryPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const summary = mergeDocumentPayload(subject, [
    "patientSummary",
    "clinicalSummary",
    "summary",
    "clinical",
    "ips",
    "portablePatientSummary",
  ]);
  const critical = getObject(subject, "critical") ?? {};
  return {
    ...summary,
    conditions: firstNonEmptyItems(
      getNested(summary, ["conditions"]),
      getNested(critical, ["conditions"]),
    ).map((item) => ({
      ...item,
      display: firstText(
        getText(item, "display"),
        getText(item, "name"),
        getText(item, "label"),
      ),
    })),
    medications: firstNonEmptyItems(
      getNested(summary, ["medications"]),
      getNested(critical, ["medications"]),
      getNested(subject, ["medications"]),
    ).map((item) => ({
      ...item,
      name: firstText(
        getText(item, "nameTh"),
        getText(item, "name"),
        getText(item, "display"),
        getText(item, "label"),
      ),
      dose: firstText(getText(item, "dose"), getText(item, "frequency")),
    })),
    allergies: firstNonEmptyItems(
      getNested(summary, ["allergies"]),
      getNested(critical, ["allergies"]),
    ).map((item) => ({
      ...item,
      substance: firstText(
        getText(item, "substance"),
        getText(item, "display"),
        getText(item, "label"),
      ),
      severity: getText(item, "severity"),
    })),
    vitalSigns: firstNonEmptyItems(
      getNested(summary, ["vitalSigns"]),
      getNested(subject, ["vitalSigns"]),
    ),
    carePlan: firstText(
      getText(summary, "carePlan"),
      getText(subject, "carePlan"),
    ),
  };
}

export function consentPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const consent = mergeDocumentPayload(subject, [
    "consentReceipt",
    "consent",
    "consentDetails",
  ]);
  return {
    ...consent,
    recipient: firstText(
      getText(consent, "recipient"),
      getText(consent, "grantedToOrganizationId"),
      getText(consent, "requesterId"),
    ),
    scope: getNested(consent, ["scope"]) ?? getNested(consent, ["scopes"]),
  };
}

export function mpiPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const mpi = mergeDocumentPayload(subject, [
    "mpiLinkCertificate",
    "mpiLink",
    "mpi",
    "linkCertificate",
  ]);
  return {
    ...mpi,
    confidence: firstText(
      getText(mpi, "confidence"),
      getText(mpi, "linkConfidence"),
    ),
    matchingPolicy: firstText(
      getText(mpi, "matchingPolicy"),
      getText(mpi, "matchAlgorithm"),
      getText(mpi, "linkType"),
    ),
    reviewedBy: firstText(getText(mpi, "reviewedBy"), getText(mpi, "linkedBy")),
    linkedIdentifiers: firstNonEmptyItems(
      getNested(mpi, ["linkedIdentifiers"]),
    ).map((item) => ({
      organization: firstText(
        getText(item, "organization"),
        getText(item, "system"),
      ),
      hn: firstText(getText(item, "hn"), getText(item, "value")),
      linkStatus: firstText(
        getText(item, "linkStatus"),
        getText(mpi, "linkStatus"),
        getText(item, "isPrimary") === "true" ? "primary" : undefined,
      ),
    })),
  };
}

export function referralPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const referral = mergeDocumentPayload(subject, [
    "referral",
    "referralLetter",
    "patientReferral",
    "serviceRequest",
  ]);
  return {
    ...referral,
    referralNo: firstText(
      getText(referral, "referralNo"),
      getText(referral, "documentNo"),
    ),
    fromHospital: firstText(
      getText(referral, "fromHospital"),
      getText(referral, "from"),
      displayName(getObject(referral, "organization")),
      getText(referral, "referringDepartment"),
    ),
    toHospital: firstText(
      getText(referral, "toHospital"),
      getText(referral, "to"),
      getText(referral, "receivingFacility"),
      getText(referral, "receivingDepartment"),
    ),
    requestedService: firstText(
      getText(referral, "requestedService"),
      formatValue(getNested(referral, ["requestedServices"])),
      getText(referral, "receivingDepartment"),
    ),
    reason: firstText(
      getText(referral, "reason"),
      getText(referral, "reasonForReferralTh"),
      getText(referral, "reasonForReferral"),
    ),
    clinicalNotes: firstText(
      getText(referral, "clinicalNotes"),
      getText(getObject(referral, "clinicalSummary"), "primaryConcern"),
      getText(referral, "reasonForReferralTh"),
    ),
    authoredOn: firstText(
      getText(referral, "authoredOn"),
      getText(referral, "referralDate"),
      getText(referral, "issuedAt"),
    ),
  };
}

export function dischargeSummaryPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  return mergeDocumentPayload(subject, ["dischargeSummary"]);
}

export function coveragePayload(subject: CredentialRenderItem): CredentialRenderItem {
  const coverage = mergeDocumentPayload(subject, [
    "insuranceEligibility",
    "coverageEligibility",
    "eligibility",
    "coverage",
    "benefits",
  ]);
  const rootPayer = getObject(subject, "payer");
  const payer = getObject(coverage, "payer") ?? rootPayer;
  const benefits = getObject(coverage, "benefits") ?? {};
  const benefitSummary = firstNonEmptyItems(
    getNested(coverage, ["benefitSummary"]),
  );
  return {
    ...coverage,
    payer: payer ?? getText(coverage, "payer"),
    status: firstText(
      getText(coverage, "status"),
      getText(rootPayer, "status"),
      getText(payer, "status"),
      getText(coverage, "eligibilityStatus"),
    ),
    planName: firstText(
      getText(coverage, "planName"),
      getText(coverage, "plan"),
      getText(payer, "planName"),
    ),
    memberId: firstText(
      getText(coverage, "memberId"),
      getText(coverage, "policyNo"),
      getText(payer, "policyNo"),
    ),
    network: firstText(
      getText(coverage, "network"),
      getText(coverage, "networkName"),
    ),
    benefitSummary: benefitSummary.length
      ? benefitSummary
      : benefitItems(benefits, coverage),
    coveragePeriod: getObject(coverage, "coveragePeriod") ?? {
      start: getText(coverage, "validFrom"),
      end: getText(coverage, "validUntil"),
    },
    lastCheckedAt: firstText(
      getText(coverage, "lastCheckedAt"),
      getText(coverage, "checkedAt"),
    ),
    copay: firstText(getText(coverage, "copay"), getText(benefits, "copay")),
    preAuthorizationRequired:
      getNested(coverage, ["preAuthorizationRequired"]) ??
      getNested(benefits, ["preAuthorizationRequired"]),
    directBilling:
      getNested(coverage, ["directBilling"]) ??
      getNested(benefits, ["directBilling"]),
  };
}

export function claimPackagePayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const claimPackage = mergeDocumentPayload(subject, [
    "claimPackage",
    "claim",
    "claimBundle",
    "claimRequest",
  ]);
  return {
    ...claimPackage,
    items: firstNonEmptyItems(
      getNested(claimPackage, ["items"]),
      getNested(claimPackage, ["serviceItems"]),
      getNested(claimPackage, ["serviceLines"]),
      getNested(claimPackage, ["lineItems"]),
      getNested(claimPackage, ["attachedEvidence"]),
    ),
    totalAmount:
      getNested(claimPackage, ["totalAmount"]) ??
      getNested(claimPackage, ["estimatedTotal"]),
    claimId: firstText(
      getText(claimPackage, "claimId"),
      getText(claimPackage, "claimNo"),
      getText(claimPackage, "claimRef"),
    ),
  };
}

export function claimReceiptPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const receipt = mergeDocumentPayload(subject, [
    "claimReceipt",
    "receipt",
    "invoice",
    "claim",
  ]);
  return {
    ...receipt,
    claimId: firstText(
      getText(receipt, "claimId"),
      getText(receipt, "claimRef"),
      getText(receipt, "claimNo"),
    ),
    payerRef: firstText(
      getText(receipt, "payerRef"),
      getText(receipt, "payerReference"),
      getText(receipt, "payerId"),
    ),
    receiptNo: firstText(
      getText(receipt, "receiptNo"),
      getText(receipt, "documentNo"),
    ),
    invoiceNo: firstText(
      getText(receipt, "invoiceNo"),
      getText(receipt, "invoiceRef"),
    ),
    adjudicationOutcome: firstText(
      getText(receipt, "adjudicationOutcome"),
      getText(receipt, "claimStatus"),
      getText(receipt, "status"),
    ),
    items: firstNonEmptyItems(
      getNested(receipt, ["items"]),
      getNested(receipt, ["lineItems"]),
      getNested(receipt, ["breakdown"]),
      getNested(receipt, ["serviceItems"]),
    ),
    approvedAmount:
      getNested(receipt, ["approvedAmount"]) ??
      getNested(receipt, ["netAmount"]),
    totalAmount:
      getNested(receipt, ["totalAmount"]) ??
      getNested(receipt, ["totalClaimed"]),
  };
}

export function quotationPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const quotation = mergeDocumentPayload(subject, [
    "treatmentQuotation",
    "quotation",
    "estimate",
    "costEstimate",
  ]);
  return {
    ...quotation,
    quotationNo: firstText(
      getText(quotation, "quotationNo"),
      getText(quotation, "documentNo"),
    ),
    items: firstNonEmptyItems(
      getNested(quotation, ["items"]),
      getNested(quotation, ["lineItems"]),
      getNested(quotation, ["costItems"]),
      getNested(getObject(quotation, "packageDetails"), ["lineItems"]),
    ),
    estimatedTotal:
      getNested(quotation, ["estimatedTotal"]) ??
      getNested(quotation, ["totalAmount"]),
    packageName: firstText(
      getText(quotation, "packageNameTh"),
      getText(quotation, "packageName"),
      getText(quotation, "packageNameEn"),
    ),
  };
}

export function visaSupportLetterPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const letter = mergeDocumentPayload(subject, ["visaSupportLetter"]);
  return {
    ...letter,
    letterNo: firstText(
      getText(letter, "letterNo"),
      getText(letter, "documentNo"),
    ),
    proposedVisitPeriod:
      getObject(letter, "proposedVisitPeriod") ??
      getObject(letter, "visitPeriod"),
  };
}

export function guaranteeLetterPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const letter = mergeDocumentPayload(subject, ["guaranteeLetter"]);
  return {
    ...letter,
    guaranteeNo: firstText(
      getText(letter, "guaranteeNo"),
      getText(letter, "guaranteeNumber"),
      getText(letter, "guaranteeRef"),
      getText(letter, "documentNo"),
    ),
    payer: getObject(letter, "payer") ?? getText(letter, "issuedByPayer"),
    preAuthNo: firstText(
      getText(letter, "preAuthNo"),
      getText(letter, "preAuthorizationNo"),
    ),
    guaranteeLimit: getObject(letter, "guaranteeLimit") ?? {
      amount: firstText(
        getText(letter, "approvedLimit"),
        getText(letter, "approvedAmount"),
      ),
      currency: getText(letter, "currency"),
    },
  };
}

export function syncReceiptPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const receipt = mergeDocumentPayload(subject, ["syncReceipt"]);
  return {
    ...receipt,
    syncId: firstText(
      getText(receipt, "syncId"),
      getText(receipt, "documentNo"),
      getText(receipt, "idempotencyKey"),
    ),
    sourceSystem: firstText(
      getText(receipt, "sourceSystem"),
      getText(receipt, "targetId"),
    ),
    completedAt: firstText(
      getText(receipt, "completedAt"),
      getText(receipt, "executedAt"),
      getText(getObject(receipt, "execution"), "completedAt"),
    ),
  };
}

export function manifestPayload(subject: CredentialRenderItem): CredentialRenderItem {
  const manifest = mergeDocumentPayload(subject, ["shlManifest", "manifest"]);
  const files = firstNonEmptyItems(
    getNested(manifest, ["files"]),
    getNested(manifest, ["documents"]),
  );
  return {
    ...manifest,
    shlId: firstText(
      getText(manifest, "shlId"),
      getText(manifest, "smartHealthLinkId"),
      getText(manifest, "bundleId"),
    ),
    expiresAt: firstText(
      getText(manifest, "expiresAt"),
      getText(getObject(manifest, "accessControl"), "expiresAt"),
    ),
    files: files.map((file) => ({
      fileId: firstText(
        getText(file, "fileId"),
        getText(file, "id"),
        getText(file, "documentNo"),
        getText(file, "title"),
      ),
      contentType: firstText(
        getText(file, "contentType"),
        getText(file, "type"),
        getText(file, "documentType"),
      ),
      documentTypes:
        getNested(file, ["documentTypes"]) ??
        getText(file, "documentType") ??
        getText(file, "title"),
    })),
  };
}

export function appointmentPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const appointment = mergeDocumentPayload(subject, ["appointment"]);
  return {
    ...appointment,
    serviceType: firstText(
      getText(appointment, "serviceType"),
      getText(appointment, "appointmentType"),
      getText(appointment, "reasonForVisit"),
    ),
    start: firstText(
      getText(appointment, "start"),
      joinDateTime(
        getText(appointment, "scheduledDate"),
        getText(appointment, "scheduledTime"),
      ),
    ),
    checkinInstruction: firstText(
      getText(appointment, "checkinInstruction"),
      getText(appointment, "preparationInstructions"),
      getText(appointment, "preparationInstructionsEn"),
    ),
  };
}

export function travelDocumentPayload(
  subject: CredentialRenderItem,
): CredentialRenderItem {
  const travel = mergeDocumentPayload(subject, ["travelDocument", "travel"]);
  return {
    ...travel,
    passportNumber: firstText(
      getText(travel, "passportNumber"),
      getText(travel, "passportNoMasked"),
      getText(travel, "passport"),
    ),
    verificationStatus: firstText(
      getText(travel, "verificationStatus"),
      getText(travel, "status"),
    ),
  };
}

export function normalizeMedicationItem(
  item: CredentialRenderItem,
): CredentialRenderItem {
  return {
    ...item,
    medicationName: firstText(
      getText(item, "medicationName"),
      getText(item, "nameTh"),
      getText(item, "name"),
      getText(item, "display"),
    ),
    dosageInstruction: firstText(
      getText(item, "dosageInstruction"),
      getText(item, "instructions"),
      getText(item, "dose"),
      getText(item, "frequency"),
    ),
    quantity: firstText(
      getText(item, "quantity"),
      getText(item, "dispenseQuantity"),
      getText(item, "daysSupply"),
    ),
  };
}

export function mergeDocumentPayload(
  source: CredentialRenderItem,
  keys: string[],
): CredentialRenderItem {
  return mergePortalRenderPayload(source, keys);
}
