export type CredentialRenderItem = Record<string, unknown>;

export type CredentialRenderField = {
  label: string;
  value: unknown;
  sensitivity?: string;
  discloseByDefault?: boolean;
  path?: string;
};

export type CredentialRenderSectionKind =
  | "identity"
  | "clinical"
  | "financial"
  | "document"
  | "trust"
  | "policy"
  | "technical";

export type CredentialRenderSection = {
  key: string;
  title: string;
  kind: CredentialRenderSectionKind;
  fields: CredentialRenderField[];
};

export type CredentialRenderNarrative = {
  title: string;
  body: string;
  sections: string[];
  sourceSystem?: string;
};

export type ClaimReceiptRenderKind =
  | "payment_receipt"
  | "submission_receipt"
  | "claim_status";

export type CredentialPaperSectionKind =
  | "fields"
  | "table"
  | "note"
  | "alert"
  | "letter";

export type CredentialPaperTableColumn = {
  key: string;
  label: string;
  labelEn?: string;
  align?: "start" | "center" | "end";
};

export type CredentialPaperSection = {
  key: string;
  title: string;
  titleEn?: string;
  kind: CredentialPaperSectionKind;
  fields?: CredentialRenderField[];
  columns?: CredentialPaperTableColumn[];
  rows?: CredentialRenderItem[];
  body?: unknown;
  tone?: "neutral" | "info" | "warning" | "critical";
  sourcePath?: string;
};

export type CredentialPaperSignatory = {
  name?: string;
  role?: string;
  licenseNo?: string;
  organization?: string;
  signedAt?: string;
};

export type CredentialPhysicalFormFactor = {
  kind: "iso_id_1" | "a4_portrait";
  widthMm: number;
  heightMm: number;
  orientation: "landscape" | "portrait";
};

export type CredentialPaperModel = {
  formFactor: CredentialPhysicalFormFactor;
  letterhead: {
    nameTh?: string;
    nameEn?: string;
    code?: string;
    identifier?: string;
    address?: string;
    phone?: string;
    logoUrl?: string;
    did?: string;
  };
  title: {
    th: string;
    en?: string;
  };
  patientFields: CredentialRenderField[];
  metadataFields: CredentialRenderField[];
  sections: CredentialPaperSection[];
  signatories: CredentialPaperSignatory[];
  evidence: CredentialRenderItem[];
  watermark?: string;
  issuerRole?: string;
  generic: boolean;
};

export type CredentialRenderPayloads = {
  labReport: CredentialRenderItem;
  diagnosticReport: CredentialRenderItem;
  certificate: CredentialRenderItem;
  clinicalSummary: CredentialRenderItem;
  consent: CredentialRenderItem;
  mpi: CredentialRenderItem;
  referral: CredentialRenderItem;
  dischargeSummary: CredentialRenderItem;
  coverage: CredentialRenderItem;
  claimPackage: CredentialRenderItem;
  claimReceipt: CredentialRenderItem;
  quotation: CredentialRenderItem;
  visaSupportLetter: CredentialRenderItem;
  guaranteeLetter: CredentialRenderItem;
  syncReceipt: CredentialRenderItem;
  manifest: CredentialRenderItem;
  appointment: CredentialRenderItem;
  travelDocument: CredentialRenderItem;
  immunizationItems: CredentialRenderItem[];
  prescriptionItems: CredentialRenderItem[];
  medicationSummaryItems: CredentialRenderItem[];
  pharmacyDispenseItems: CredentialRenderItem[];
  allergyItems: CredentialRenderItem[];
};

export type CredentialRenderModel = {
  documentType: string;
  variant: string;
  accent: string;
  kindLabel: string;
  credential: CredentialRenderItem;
  subject: CredentialRenderItem;
  patient: CredentialRenderItem;
  hospital: CredentialRenderItem;
  document: CredentialRenderItem;
  issuer: CredentialRenderItem;
  payloads: CredentialRenderPayloads;
  fields: CredentialRenderField[];
  sections: CredentialRenderSection[];
  narrative: CredentialRenderNarrative;
  paper: CredentialPaperModel;
  claimReceiptKind?: ClaimReceiptRenderKind;
};
