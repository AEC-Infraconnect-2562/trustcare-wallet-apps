import type { ReadinessContext, ReadinessRequirement } from "./models";
import {
  canonicalServiceProfiles,
  normalizeDocumentType,
  type CanonicalDocumentType,
} from "./canonicalDocuments";

export type DocumentRequestSource =
  | "trustcare_portal"
  | "connected_fhir"
  | "payer"
  | "patient_upload"
  | "external_wallet";

export type DocumentRequestFormat =
  | "vc_vp"
  | "oid4vci_offer"
  | "fhir_document_reference"
  | "fhir_bundle"
  | "standard_shl"
  | "certified_shl_manifest"
  | "pdf_image";

export type DocumentRequestReturnChannel =
  | "portal_sync"
  | "payer_exchange"
  | "oid4vci_offer"
  | "fhir_pull"
  | "shl_link"
  | "manual_upload"
  | "external_wallet";

export type DocumentPackageScope = "single_document" | "document_bundle";

export type DocumentRequestOption<T extends string> = {
  id: T;
  label: string;
  description: string;
  enabled: boolean;
  recommended?: boolean;
  reasonDisabled?: string;
};

export type DocumentRequestRequirement = {
  key: string;
  label: string;
  labelEn?: string;
  required?: boolean;
  category?: string;
  action?: string;
  sourceHint?: string;
  documentTypes: ReadonlyArray<CanonicalDocumentType>;
};

export type DocumentRequestPlanInput = {
  context: ReadinessContext;
  requirements: ReadonlyArray<
    ReadinessRequirement | DocumentRequestRequirement
  >;
  source?: DocumentRequestSource;
  format?: DocumentRequestFormat;
  scope?: DocumentPackageScope;
};

export type DocumentRequestPlan = {
  context: ReadinessContext;
  serviceLabel: string;
  selectedTypes: CanonicalDocumentType[];
  selectedRequirements: DocumentRequestRequirement[];
  selectedSource: DocumentRequestSource;
  selectedFormat: DocumentRequestFormat;
  selectedScope: DocumentPackageScope;
  defaultSource: DocumentRequestSource;
  defaultFormat: DocumentRequestFormat;
  defaultScope: DocumentPackageScope;
  sourceOptions: DocumentRequestOption<DocumentRequestSource>[];
  formatOptions: DocumentRequestOption<DocumentRequestFormat>[];
  returnChannelOptions: DocumentRequestOption<DocumentRequestReturnChannel>[];
  controls: {
    selectiveDisclosure: boolean;
    fhirEndpoint: boolean;
    shlAccessPolicy: boolean;
    trustCareCertification: boolean;
    manualFileUpload: boolean;
  };
  trustPolicy:
    "issuer_signed" | "patient_provided_unverified" | "trustcare_certified";
  warnings: string[];
  nextSteps: string[];
};

export type DocumentRequestDraft = {
  context: ReadinessContext;
  serviceLabel: string;
  source: DocumentRequestSource;
  format: DocumentRequestFormat;
  scope: DocumentPackageScope;
  returnChannel: DocumentRequestReturnChannel;
  requestedDocumentTypes: CanonicalDocumentType[];
  requestedRequirementKeys: string[];
  patientId?: number | string;
  accessPolicy?: {
    passcodeRequired?: boolean;
    expiryHours?: number;
    maxAccessCount?: number;
  };
  selectiveDisclosureFields?: string[];
  trustPolicy: DocumentRequestPlan["trustPolicy"];
  destinationLabel: string;
  formatLabel: string;
  routeSelection: "automatic" | "explicit";
  nextSteps: string[];
  warnings: string[];
};

const sourceLabels: Record<
  DocumentRequestSource,
  Omit<DocumentRequestOption<DocumentRequestSource>, "id" | "enabled">
> = {
  trustcare_portal: {
    label: "TrustCare Portal / โรงพยาบาลในเครือข่าย",
    description: "ขอให้ issuer ออก VC/VP หรือจัด SHL ที่ตรวจสอบแหล่งที่มาได้",
  },
  connected_fhir: {
    label: "FHIR/HIS ที่เชื่อมต่อไว้",
    description:
      "ดึง DocumentReference, Bundle หรือ clinical resources จากระบบต้นทาง",
  },
  payer: {
    label: "ผู้จ่ายเงิน/ประกัน",
    description: "ขอสิทธิรักษา เอกสารเคลม หรือหลักฐานรับรองจาก payer",
  },
  patient_upload: {
    label: "นำเข้าเองจากไฟล์ของผู้ใช้",
    description:
      "รับ PDF, รูปภาพ หรือ FHIR JSON เป็นเอกสารอ้างอิงที่ยังไม่ยืนยัน",
  },
  external_wallet: {
    label: "Wallet/Partner ภายนอก",
    description: "รับ VP, OID4VCI offer หรือ SHL จากกระเป๋าอื่น",
  },
};

const formatLabels: Record<
  DocumentRequestFormat,
  Omit<DocumentRequestOption<DocumentRequestFormat>, "id" | "enabled">
> = {
  vc_vp: {
    label: "VC/VP",
    description:
      "เอกสารเดี่ยวหรือชุดเล็กที่ต้องตรวจลายเซ็นและใช้ selective disclosure",
  },
  oid4vci_offer: {
    label: "OID4VCI Offer",
    description:
      "ให้ issuer ส่ง credential offer เพื่อให้ Wallet รับ VC เข้ามาโดยตรง",
  },
  fhir_document_reference: {
    label: "FHIR DocumentReference",
    description: "เหมาะกับไฟล์หรือเอกสารเดี่ยวที่มี metadata และ attachment",
  },
  fhir_bundle: {
    label: "FHIR Bundle / Document",
    description:
      "เหมาะกับชุดข้อมูลจาก HIS/EMR/LIS ที่มีหลาย resource หรือ Composition",
  },
  standard_shl: {
    label: "Standard SHL",
    description:
      "ลิงก์สุขภาพตาม SMART Health Links สำหรับชุดข้อมูลขนาดใหญ่หรือข้อมูลต่อเนื่อง",
  },
  certified_shl_manifest: {
    label: "SHL + Manifest VP",
    description:
      "ใช้ SHL เป็น transport พร้อม holder VP และขอ Manifest Credential จากโรงพยาบาลเมื่อจำเป็น",
  },
  pdf_image: {
    label: "PDF / Image Upload",
    description:
      "ไฟล์จากผู้ใช้หรือระบบภายนอก ต้องรอ trusted issuer ยืนยันก่อนใช้เป็น VC",
  },
};

const returnChannelLabels: Record<
  DocumentRequestReturnChannel,
  Omit<DocumentRequestOption<DocumentRequestReturnChannel>, "id" | "enabled">
> = {
  portal_sync: {
    label: "Sync จาก TrustCare Portal",
    description: "ดึง VC/VP ที่ issuer ลงนามแล้วกลับเข้ากระเป๋าของผู้ใช้",
  },
  payer_exchange: {
    label: "รับผ่าน Payer Adapter",
    description:
      "รับเอกสารสิทธิหรือหลักฐานเคลมจากผู้จ่ายเงินที่รับผิดชอบโดยตรง",
  },
  oid4vci_offer: {
    label: "รับผ่าน OID4VCI",
    description: "เปิด offer link หรือสแกน QR เพื่อรับ credential",
  },
  fhir_pull: {
    label: "ดึงจาก FHIR endpoint",
    description:
      "ใช้ consent/scope ที่กำหนดเพื่อดึง DocumentReference หรือ Bundle",
  },
  shl_link: {
    label: "รับเป็น SHL",
    description:
      "รับ shlink หรือ viewer URL พร้อมนโยบาย PIN/expiry แยกจากตัว QR",
  },
  manual_upload: {
    label: "นำเข้าไฟล์เอง",
    description:
      "ผู้ใช้เลือกไฟล์หรือวาง JSON แล้วระบบเก็บเป็น DocumentReference",
  },
  external_wallet: {
    label: "รับจาก Wallet ภายนอก",
    description: "นำเข้า VP, SHL หรือ offer จาก partner wallet อื่น",
  },
};

const patientSourceLabels: Record<DocumentRequestSource, string> = {
  trustcare_portal: "โรงพยาบาลหรือคลินิกในเครือข่าย TrustCare",
  connected_fhir: "ระบบเวชระเบียนของโรงพยาบาลที่เชื่อมต่อ",
  payer: "บริษัทประกันหรือผู้รับผิดชอบค่าใช้จ่าย",
  patient_upload: "ไฟล์ที่คุณนำเข้าเอง",
  external_wallet: "ผู้ให้บริการหรือกระเป๋าสุขภาพภายนอก",
};

const patientReturnChannelLabels: Record<
  DocumentRequestReturnChannel,
  string
> = {
  portal_sync: "รับเอกสารรับรองกลับเข้ากระเป๋านี้โดยตรง",
  payer_exchange: "รับเอกสารจากบริษัทประกันเข้ากระเป๋านี้โดยตรง",
  oid4vci_offer: "รับเอกสารรับรองกลับเข้ากระเป๋านี้โดยตรง",
  fhir_pull: "รับข้อมูลจากเวชระเบียนต้นทางเข้ากระเป๋านี้",
  shl_link: "รับลิงก์เอกสารที่ควบคุมการเข้าถึงได้",
  manual_upload: "เก็บเป็นสำเนาที่นำเข้าและรอการตรวจสอบ",
  external_wallet: "รับเอกสารจากผู้ให้บริการภายนอกเข้ากระเป๋านี้",
};

export function buildDocumentRequestPlan(
  input: DocumentRequestPlanInput,
): DocumentRequestPlan {
  const selectedRequirements = normalizeRequirements(input.requirements);
  const selectedTypes = unique(
    selectedRequirements.flatMap((requirement) => requirement.documentTypes),
  );
  const defaultScope =
    selectedTypes.length > 1 ? "document_bundle" : "single_document";
  const scope = input.scope ?? defaultScope;
  const defaultSource = chooseDefaultSource(selectedRequirements);
  const sourceOptions = buildSourceOptions(selectedRequirements).map(
    (option) => ({
      ...option,
      recommended: option.id === defaultSource,
    }),
  );
  const requestedSource = input.source ?? defaultSource;
  const source = sourceOptions.find(
    (option) => option.id === requestedSource && option.enabled,
  )
    ? requestedSource
    : defaultSource;
  const defaultFormat = chooseDefaultFormat(source, scope, selectedTypes);
  const formatOptions = buildFormatOptions(source, scope, selectedTypes).map(
    (option) => ({
      ...option,
      recommended: option.id === defaultFormat,
    }),
  );
  const requestedFormat = input.format ?? defaultFormat;
  const format = formatOptions.find(
    (option) => option.id === requestedFormat && option.enabled,
  )
    ? requestedFormat
    : defaultFormat;
  const returnChannelOptions = buildReturnChannelOptions(source, format);
  const controls = buildControlState(source, format);
  const warnings = buildWarnings(source, format, scope);
  const serviceLabel =
    canonicalServiceProfiles[input.context]?.label ?? input.context;
  return {
    context: input.context,
    serviceLabel,
    selectedTypes,
    selectedRequirements,
    selectedSource: source,
    selectedFormat: format,
    selectedScope: scope,
    defaultSource,
    defaultFormat,
    defaultScope,
    sourceOptions,
    formatOptions,
    returnChannelOptions,
    controls,
    trustPolicy: buildTrustPolicy(source, format),
    warnings,
    nextSteps: buildNextSteps(source, format),
  };
}

export function createDocumentRequestDraft(input: {
  context: ReadinessContext;
  requirements: ReadonlyArray<
    ReadinessRequirement | DocumentRequestRequirement
  >;
  source: DocumentRequestSource;
  format: DocumentRequestFormat;
  scope: DocumentPackageScope;
  returnChannel?: DocumentRequestReturnChannel;
  patientId?: number | string;
  accessPolicy?: DocumentRequestDraft["accessPolicy"];
  selectiveDisclosureFields?: string[];
}): DocumentRequestDraft {
  const plan = buildDocumentRequestPlan(input);
  const defaultReturnChannel =
    plan.returnChannelOptions.find(
      (option) => option.enabled && option.recommended,
    )?.id ??
    plan.returnChannelOptions.find((option) => option.enabled)?.id ??
    "manual_upload";
  const requestedReturnChannel = input.returnChannel;
  const returnChannel =
    requestedReturnChannel &&
    plan.returnChannelOptions.find(
      (option) => option.id === requestedReturnChannel && option.enabled,
    )
      ? requestedReturnChannel
      : defaultReturnChannel;
  return {
    context: input.context,
    serviceLabel: plan.serviceLabel,
    source: plan.selectedSource,
    format: plan.selectedFormat,
    scope: plan.selectedScope,
    returnChannel,
    requestedDocumentTypes: plan.selectedTypes,
    requestedRequirementKeys: plan.selectedRequirements.map(
      (requirement) => requirement.key,
    ),
    patientId: input.patientId,
    accessPolicy: input.accessPolicy,
    selectiveDisclosureFields: input.selectiveDisclosureFields,
    trustPolicy: plan.trustPolicy,
    destinationLabel: sourceLabels[plan.selectedSource].label,
    formatLabel: formatLabels[plan.selectedFormat].label,
    routeSelection: "explicit",
    warnings: plan.warnings,
    nextSteps: plan.nextSteps,
  };
}

export function createAutomaticDocumentRequestDraft(input: {
  context: ReadinessContext;
  requirements: ReadonlyArray<
    ReadinessRequirement | DocumentRequestRequirement
  >;
  patientId?: number | string;
}): DocumentRequestDraft {
  const plan = buildDocumentRequestPlan({
    context: input.context,
    requirements: input.requirements,
  });
  const draft = createDocumentRequestDraft({
    context: input.context,
    requirements: input.requirements,
    source: plan.selectedSource,
    format: plan.selectedFormat,
    scope: plan.selectedScope,
    patientId: input.patientId,
  });
  return {
    ...draft,
    routeSelection: "automatic",
  };
}

export function documentRequestSourceLabel(
  source: DocumentRequestSource,
): string {
  return sourceLabels[source].label;
}

export function documentRequestFormatLabel(
  format: DocumentRequestFormat,
): string {
  return formatLabels[format].label;
}

export function documentRequestReturnChannelLabel(
  channel: DocumentRequestReturnChannel,
): string {
  return returnChannelLabels[channel].label;
}

export function documentRequestPatientSourceLabel(
  source: DocumentRequestSource,
): string {
  return patientSourceLabels[source];
}

export function documentRequestPatientReturnChannelLabel(
  channel: DocumentRequestReturnChannel,
): string {
  return patientReturnChannelLabels[channel];
}

function normalizeRequirements(
  requirements: ReadonlyArray<
    ReadinessRequirement | DocumentRequestRequirement
  >,
): DocumentRequestRequirement[] {
  return requirements.map((requirement) => {
    const source = requirement as ReadinessRequirement &
      DocumentRequestRequirement;
    const documentTypes = unique(
      (source.documentTypes ?? source.cardTypes ?? [])
        .map((type) => normalizeDocumentType(type))
        .filter(Boolean) as CanonicalDocumentType[],
    );
    return {
      key: source.key,
      label: source.label,
      labelEn: source.labelEn,
      required: source.required,
      category: source.category,
      action: source.action,
      sourceHint: source.sourceHint,
      documentTypes,
    };
  });
}

function chooseDefaultSource(
  requirements: DocumentRequestRequirement[],
): DocumentRequestSource {
  const types = requirements.flatMap(
    (requirement) => requirement.documentTypes,
  );
  const hints = requirements
    .map((requirement) => requirement.sourceHint ?? "")
    .join(" ")
    .toLowerCase();
  if (
    types.some(
      (type) =>
        type.includes("insurance") ||
        type.includes("claim") ||
        type.includes("guarantee"),
    )
  ) {
    return "payer";
  }
  if (
    hints.includes("lis") ||
    hints.includes("ris") ||
    hints.includes("fhir") ||
    hints.includes("emr")
  ) {
    return "connected_fhir";
  }
  return "trustcare_portal";
}

function chooseDefaultFormat(
  source: DocumentRequestSource,
  scope: DocumentPackageScope,
  types: CanonicalDocumentType[],
): DocumentRequestFormat {
  if (source === "patient_upload") return "pdf_image";
  if (scope === "document_bundle" && source === "trustcare_portal")
    return "certified_shl_manifest";
  if (scope === "document_bundle" && source !== "payer") return "standard_shl";
  if (source === "connected_fhir") {
    return scope === "document_bundle" ||
      types.some(
        (type) => type === "lab_result" || type === "diagnostic_report",
      )
      ? "fhir_bundle"
      : "fhir_document_reference";
  }
  return "vc_vp";
}

function buildSourceOptions(
  requirements: DocumentRequestRequirement[],
): DocumentRequestOption<DocumentRequestSource>[] {
  const types = requirements.flatMap(
    (requirement) => requirement.documentTypes,
  );
  const needsPayer = types.some(
    (type) =>
      type.includes("insurance") ||
      type.includes("claim") ||
      type.includes("guarantee"),
  );
  return (Object.keys(sourceLabels) as DocumentRequestSource[]).map((id) => {
    const enabled = id !== "payer" || needsPayer;
    return {
      id,
      ...sourceLabels[id],
      enabled,
      reasonDisabled: enabled
        ? undefined
        : "ใช้เมื่อเอกสารเกี่ยวกับสิทธิ ประกัน เคลม หรือผู้จ่ายเงิน",
    };
  });
}

function buildFormatOptions(
  source: DocumentRequestSource,
  scope: DocumentPackageScope,
  types: CanonicalDocumentType[],
): DocumentRequestOption<DocumentRequestFormat>[] {
  return (Object.keys(formatLabels) as DocumentRequestFormat[]).map((id) => {
    const reasonDisabled = formatDisabledReason(id, source, scope, types);
    return {
      id,
      ...formatLabels[id],
      enabled: !reasonDisabled,
      reasonDisabled,
    };
  });
}

function formatDisabledReason(
  format: DocumentRequestFormat,
  source: DocumentRequestSource,
  scope: DocumentPackageScope,
  types: CanonicalDocumentType[],
): string | undefined {
  const singleIdentityOnly =
    scope === "single_document" &&
    types.length === 1 &&
    types[0] === "patient_identity";
  if (format === "vc_vp" && source === "patient_upload") {
    return "ไฟล์ที่ผู้ใช้นำเข้าเองยังไม่ใช่ VC/VP จนกว่า trusted issuer จะลงนาม";
  }
  if (format === "oid4vci_offer" && source === "patient_upload") {
    return "OID4VCI ต้องมาจาก issuer หรือระบบที่ออก credential ได้";
  }
  if (format === "fhir_bundle" && scope === "single_document") {
    return "FHIR Bundle เหมาะกับชุดเอกสารหรือหลาย resource";
  }
  if (
    format === "standard_shl" &&
    (source === "patient_upload" || singleIdentityOnly)
  ) {
    return source === "patient_upload"
      ? "ไฟล์นำเข้าเองควรถูกเก็บเป็น DocumentReference ก่อน"
      : "เอกสารยืนยันตัวตนเดี่ยวควรใช้ VC/VP หรือ OID4VCI";
  }
  if (format === "certified_shl_manifest") {
    if (source !== "trustcare_portal") {
      return "Certified SHL ต้องมี Manifest Credential ที่ TrustCare Portal ออกด้วยกุญแจโรงพยาบาลและ Wallet ตรวจผ่าน";
    }
    if (scope !== "document_bundle") {
      return "Manifest VP เหมาะกับชุดเอกสารหลายรายการ";
    }
  }
  if (format === "pdf_image" && source !== "patient_upload") {
    return "PDF/Image ใช้กับการนำเข้าเองหรือเอกสารจากภายนอกที่ยังไม่ลงนาม";
  }
  return undefined;
}

function buildReturnChannelOptions(
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
): DocumentRequestOption<DocumentRequestReturnChannel>[] {
  return (
    Object.keys(returnChannelLabels) as DocumentRequestReturnChannel[]
  ).map((id) => {
    const enabled = returnChannelEnabled(id, source, format);
    return {
      id,
      ...returnChannelLabels[id],
      enabled,
      recommended:
        (source === "trustcare_portal" && id === "portal_sync") ||
        (source === "payer" && id === "payer_exchange") ||
        (format === "oid4vci_offer" && id === "oid4vci_offer") ||
        (format === "standard_shl" && id === "shl_link") ||
        (format === "certified_shl_manifest" && id === "shl_link") ||
        (format.startsWith("fhir") && id === "fhir_pull") ||
        (source === "patient_upload" && id === "manual_upload") ||
        (source === "external_wallet" && id === "external_wallet"),
      reasonDisabled: enabled
        ? undefined
        : "ช่องทางนี้ไม่ตรงกับ source หรือ format ที่เลือก",
    };
  });
}

function returnChannelEnabled(
  channel: DocumentRequestReturnChannel,
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
): boolean {
  if (channel === "portal_sync") return source === "trustcare_portal";
  if (channel === "payer_exchange") return source === "payer";
  if (channel === "oid4vci_offer") return format === "oid4vci_offer";
  if (channel === "fhir_pull")
    return format === "fhir_document_reference" || format === "fhir_bundle";
  if (channel === "shl_link")
    return format === "standard_shl" || format === "certified_shl_manifest";
  if (channel === "manual_upload")
    return source === "patient_upload" || format === "pdf_image";
  if (channel === "external_wallet") return source === "external_wallet";
  return false;
}

function buildControlState(
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
) {
  return {
    selectiveDisclosure: format === "vc_vp" || format === "oid4vci_offer",
    fhirEndpoint:
      format === "fhir_document_reference" || format === "fhir_bundle",
    shlAccessPolicy:
      format === "standard_shl" || format === "certified_shl_manifest",
    trustCareCertification:
      source === "trustcare_portal" && format === "certified_shl_manifest",
    manualFileUpload: source === "patient_upload" || format === "pdf_image",
  };
}

function buildTrustPolicy(
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
): DocumentRequestPlan["trustPolicy"] {
  if (source === "patient_upload" || format === "pdf_image")
    return "patient_provided_unverified";
  if (format === "certified_shl_manifest") return "trustcare_certified";
  return "issuer_signed";
}

function buildWarnings(
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
  scope: DocumentPackageScope,
): string[] {
  const warnings: string[] = [];
  if (source === "patient_upload") {
    warnings.push(
      "เอกสารจากผู้ใช้จะถูกเก็บเป็น DocumentReference แบบยังไม่ยืนยัน จนกว่า trusted issuer จะตรวจและลงนาม",
    );
  }
  if (format === "standard_shl") {
    warnings.push(
      "Standard SHL ใช้ร่วมกับระบบภายนอกได้ แต่ยังไม่ถือว่าโรงพยาบาลรับรองจนกว่าจะมี Manifest Credential ที่ตรวจผ่าน",
    );
  }
  if (format === "certified_shl_manifest") {
    warnings.push(
      "Certified SHL ต้องเก็บ holder VP, Manifest Credential และ source/file hashes ไว้ให้ verifier ตรวจสอบได้",
    );
  }
  if (format === "fhir_bundle" && scope === "document_bundle") {
    warnings.push(
      "FHIR Bundle ควรเรียงข้อมูลตาม record time และเก็บ package time แยกเพื่อไม่ให้ timeline สับสน",
    );
  }
  return warnings;
}

function buildNextSteps(
  source: DocumentRequestSource,
  format: DocumentRequestFormat,
): string[] {
  if (source === "patient_upload" || format === "pdf_image") {
    return [
      "ผู้ใช้เลือกไฟล์หรือวาง JSON",
      "Wallet สร้าง DocumentReference",
      "สถานะเป็นยังไม่ยืนยันจนกว่า issuer จะลงนาม",
    ];
  }
  if (format === "certified_shl_manifest") {
    return [
      "ส่งคำขอไป TrustCare Portal",
      "Wallet สร้าง SHL manifest และ holder VP; Portal ออก Manifest Credential หลังอนุมัติ",
      "Wallet sync กลับเข้ามาเป็น SHL+Manifest package",
    ];
  }
  if (format === "standard_shl") {
    return [
      "ส่งคำขอไปแหล่งข้อมูล",
      "รับ shlink หรือ viewer URL",
      "Wallet ตรวจ manifest และเก็บ access policy",
    ];
  }
  if (format === "oid4vci_offer") {
    return [
      "Issuer สร้าง credential offer",
      "Wallet รับ credential ผ่าน OID4VCI",
      "ตรวจลายเซ็นและสถานะก่อนใช้",
    ];
  }
  if (format === "fhir_document_reference" || format === "fhir_bundle") {
    return [
      "เลือก FHIR endpoint และ scope",
      "ดึง DocumentReference/Bundle",
      "เก็บเป็น evidence และรอออก VC หากต้องใช้เป็นเอกสารรับรอง",
    ];
  }
  return [
    "ส่งคำขอไป issuer",
    "รับ VC/VP ที่ลงนามแล้ว",
    "ตรวจ trust/status ก่อนนำไปใช้",
  ];
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
