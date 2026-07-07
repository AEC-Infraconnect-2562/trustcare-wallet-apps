import type { WalletCard } from "./models";

export type IpsSectionKey =
  | "patient"
  | "allergies"
  | "medications"
  | "immunizations"
  | "problems"
  | "results"
  | "procedures"
  | "care_plan"
  | "encounters"
  | "coverage"
  | "documents";

export type IpsSectionSummary = {
  key: IpsSectionKey;
  title: string;
  fhirResources: string[];
  sourceDocumentIds: Array<number | string>;
  itemCount: number;
};

export type FhirBundleDocumentLike = {
  resourceType: "Bundle";
  type: "document";
  id: string;
  timestamp: string;
  identifier?: {
    system?: string;
    value: string;
  };
  entry: Array<{
    fullUrl?: string;
    resource: Record<string, unknown>;
  }>;
};

export type IpsBuildInput = {
  id: string;
  subjectId?: string | null;
  author?: string | null;
  timestamp?: string;
  cards: WalletCard[];
};

export const IPS_SECTION_BY_DOCUMENT_TYPE: Record<string, IpsSectionKey[]> = {
  patient_identity: ["patient"],
  mpi_link_certificate: ["patient"],
  consent_receipt: ["documents"],
  patient_summary: [
    "patient",
    "problems",
    "medications",
    "allergies",
    "care_plan",
  ],
  allergy_alert: ["allergies"],
  immunization: ["immunizations"],
  medical_certificate: ["documents", "problems"],
  medication_summary: ["medications"],
  prescription: ["medications"],
  pharmacy_dispense: ["medications"],
  lab_result: ["results"],
  diagnostic_report: ["results"],
  referral_vc: ["encounters", "care_plan", "documents"],
  discharge_summary: ["encounters", "care_plan", "documents"],
  insurance_eligibility: ["coverage"],
  claim_package: ["coverage", "documents"],
  claim_receipt: ["coverage", "documents"],
  travel_document_verification: ["patient", "documents"],
  visa_support_letter: ["documents"],
  quotation: ["coverage", "documents"],
  guarantee_letter: ["coverage", "documents"],
  appointment: ["encounters"],
  staff_identity: ["documents"],
};

export function buildIpsDocumentBundle(
  input: IpsBuildInput,
): FhirBundleDocumentLike {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const subjectId =
    input.subjectId ??
    firstValue(
      input.cards.map(
        (card) => card.holderDid ?? card.patientId ?? card.ownerUserId,
      ),
    );
  const compositionId = `${input.id}-composition`;
  const entries = input.cards.flatMap((card) => cardToIpsEntries(card));

  return {
    resourceType: "Bundle",
    type: "document",
    id: input.id,
    timestamp,
    identifier: {
      system: "https://trustcare.network/ips",
      value: input.id,
    },
    entry: [
      {
        fullUrl: `urn:uuid:${compositionId}`,
        resource: {
          resourceType: "Composition",
          id: compositionId,
          status: "final",
          type: {
            coding: [
              {
                system: "http://loinc.org",
                code: "60591-5",
                display: "Patient summary Document",
              },
            ],
            text: "International Patient Summary",
          },
          subject: subjectId
            ? { reference: `Patient/${subjectId}` }
            : undefined,
          date: timestamp,
          author: [{ display: input.author ?? "TrustCare Wallet" }],
          title: "International Patient Summary",
          section: buildIpsSectionSummaries(input.cards).map((section) => ({
            title: section.title,
            code: { text: section.key },
            entry: section.sourceDocumentIds.map((id) => ({
              reference: `DocumentReference/${id}`,
            })),
          })),
        },
      },
      ...entries,
    ],
  };
}

export function buildIpsSectionSummaries(
  cards: WalletCard[],
): IpsSectionSummary[] {
  const sections = new Map<IpsSectionKey, IpsSectionSummary>();
  for (const card of cards) {
    const keys = IPS_SECTION_BY_DOCUMENT_TYPE[card.cardType] ?? ["documents"];
    for (const key of keys) {
      const existing = sections.get(key) ?? {
        key,
        title: ipsSectionTitle(key),
        fhirResources: [],
        sourceDocumentIds: [],
        itemCount: 0,
      };
      const resource = fhirResourceForDocumentType(card.cardType);
      if (!existing.fhirResources.includes(resource))
        existing.fhirResources.push(resource);
      existing.sourceDocumentIds.push(card.credentialId);
      existing.itemCount += 1;
      sections.set(key, existing);
    }
  }
  return [...sections.values()];
}

export function isIpsDocumentBundle(
  value: unknown,
): value is FhirBundleDocumentLike {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).resourceType === "Bundle" &&
    (value as Record<string, unknown>).type === "document",
  );
}

export function fhirResourceForDocumentType(documentType: string): string {
  if (documentType.includes("identity") || documentType.includes("travel"))
    return "Patient";
  if (documentType.includes("allergy")) return "AllergyIntolerance";
  if (documentType.includes("immunization")) return "Immunization";
  if (
    documentType.includes("medication") ||
    documentType.includes("prescription")
  )
    return "MedicationStatement";
  if (documentType.includes("dispense")) return "MedicationDispense";
  if (documentType.includes("lab") || documentType.includes("diagnostic"))
    return "DiagnosticReport";
  if (documentType.includes("referral")) return "ServiceRequest";
  if (documentType.includes("discharge")) return "Composition";
  if (documentType.includes("insurance")) return "Coverage";
  if (documentType.includes("claim")) return "Claim";
  if (documentType.includes("appointment")) return "Appointment";
  return "DocumentReference";
}

function cardToIpsEntries(card: WalletCard): FhirBundleDocumentLike["entry"] {
  const credential = objectValue(card.credentialData) ?? {};
  const subject = objectValue(credential.credentialSubject) ?? {};
  const documentReference =
    objectValue(subject.documentReference) ??
    documentReferenceFromEvidence(credential);
  return [
    {
      fullUrl: `urn:trustcare:credential:${card.credentialId}`,
      resource: {
        resourceType: fhirResourceForDocumentType(card.cardType),
        id: String(card.credentialId),
        status: "current",
        code: { text: card.displayName },
        effectiveDateTime: card.issuedAt ?? card.createdAt,
        subject: card.holderDid
          ? { reference: `Patient/${card.holderDid}` }
          : undefined,
      },
    },
    {
      fullUrl: `DocumentReference/${card.credentialId}`,
      resource: {
        resourceType: "DocumentReference",
        id: String(card.credentialId),
        status: "current",
        docStatus: card.credentialStatus === "active" ? "final" : "preliminary",
        type: { text: card.displayName },
        date: card.issuedAt ?? card.createdAt,
        content:
          Array.isArray(documentReference?.content) &&
          documentReference.content.length
            ? documentReference.content
            : [
                {
                  attachment: {
                    contentType: "application/vc+json",
                    title: card.displayName,
                  },
                },
              ],
      },
    },
  ];
}

function ipsSectionTitle(key: IpsSectionKey): string {
  const titles: Record<IpsSectionKey, string> = {
    patient: "Patient demographics",
    allergies: "Allergies and intolerances",
    medications: "Medication summary",
    immunizations: "Immunizations",
    problems: "Problem list",
    results: "Results and diagnostic reports",
    procedures: "Procedures",
    care_plan: "Care plan",
    encounters: "Encounters and transitions of care",
    coverage: "Coverage and financial documents",
    documents: "Supporting documents",
  };
  return titles[key];
}

function documentReferenceFromEvidence(
  credential: Record<string, unknown>,
): Record<string, unknown> | null {
  const evidence = credential.evidence;
  if (!Array.isArray(evidence)) return null;
  for (const item of evidence) {
    const entry = objectValue(item) ?? {};
    const resource =
      objectValue(entry.resource) ?? objectValue(entry.documentReference);
    if (resource?.resourceType === "DocumentReference") return resource;
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}
